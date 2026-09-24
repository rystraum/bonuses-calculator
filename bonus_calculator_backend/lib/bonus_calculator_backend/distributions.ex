defmodule BonusCalculatorBackend.Distributions do
  @moduledoc """
  Distributions, their group snapshots, snapshot members, and special bonuses.

  Any mutation on a distribution that is not in "drafted" status is rejected
  with `{:error, :not_drafted}`. Mutations are also restricted to the
  distribution's owner (`created_by`); legacy rows with no owner remain
  editable by anyone, and other users get `{:error, :not_owner}`.

  Non-owners can instead persist a `DistributionSuggestion` — a per-user set of
  proposed changes with an explanation — and simulate its effect.
  """

  import Ecto.Query, warn: false

  alias BonusCalculatorBackend.Distributions.{
    Distribution,
    DistributionGroup,
    DistributionGroupMember,
    DistributionShareholder,
    DistributionSpecialBonus,
    DistributionSuggestion
  }

  alias BonusCalculatorBackend.Accounts.User
  alias BonusCalculatorBackend.Calculator
  alias BonusCalculatorBackend.Groups.EmployeeGroup
  alias BonusCalculatorBackend.People
  alias BonusCalculatorBackend.People.Employee
  alias BonusCalculatorBackend.Repo

  @audit_assocs [:created_by, :finalized_by, :paid_out_by]

  @full_preloads [
    distribution_groups: :members,
    special_bonuses: :employee,
    distribution_shareholders: :shareholder
  ]

  def list_distributions do
    Repo.all(from d in Distribution, order_by: [desc: d.inserted_at], preload: ^@audit_assocs)
  end

  def get_distribution!(id), do: Repo.get!(Distribution, id)

  def get_distribution_full!(id) do
    Distribution
    |> Repo.get!(id)
    |> Repo.preload(@full_preloads ++ @audit_assocs)
    |> order_group_snapshots()
  end

  # Postgres returns preloaded rows in arbitrary physical order, so groups
  # and members appeared to shuffle after any edit refetched the
  # distribution. Groups keep snapshot order (inserted_at + id); members are
  # alphabetical by their snapshotted name, which never changes for a given
  # distribution, so the order is deterministic and stable across edits.
  defp order_group_snapshots(%Distribution{distribution_groups: groups} = distribution) do
    groups =
      groups
      |> Enum.sort_by(&{&1.inserted_at, &1.id})
      |> Enum.map(fn group ->
        %{group | members: Enum.sort_by(group.members, &{&1.employee_name, &1.id})}
      end)

    %{distribution | distribution_groups: groups}
  end

  def create_distribution(attrs, user \\ nil) do
    %Distribution{}
    |> Distribution.changeset(attrs)
    |> put_created_by(user)
    |> Repo.insert()
  end

  defp put_created_by(changeset, %User{} = user),
    do: Ecto.Changeset.put_change(changeset, :created_by_id, user.id)

  defp put_created_by(changeset, nil), do: changeset

  def update_distribution(%Distribution{} = distribution, attrs, user) do
    with :ok <- ensure_drafted(distribution),
         :ok <- ensure_owner(distribution, user) do
      distribution
      |> Distribution.changeset(attrs)
      |> Repo.update()
    end
  end

  def delete_distribution(%Distribution{} = distribution, user) do
    with :ok <- ensure_drafted(distribution),
         :ok <- ensure_owner(distribution, user) do
      Repo.delete(distribution)
    end
  end

  def finalize_distribution(distribution, user \\ nil)

  def finalize_distribution(%Distribution{status: "drafted"} = distribution, user) do
    with :ok <- ensure_owner(distribution, user) do
      Repo.transaction(fn ->
        distribution =
          distribution
          |> Distribution.status_changeset("finalized", %{
            finalized_by_id: user && user.id,
            finalized_at: DateTime.utc_now() |> DateTime.truncate(:second)
          })
          |> Repo.update!()

        snapshot_shareholders(distribution)

        Repo.preload(distribution, @audit_assocs)
      end)
    end
  end

  def finalize_distribution(%Distribution{}, _user), do: {:error, :invalid_transition}

  def mark_paid_distribution(distribution, user \\ nil)

  def mark_paid_distribution(%Distribution{status: "finalized"} = distribution, user) do
    with :ok <- ensure_owner(distribution, user) do
      distribution
      |> Distribution.status_changeset("paid_out", %{
        paid_out_by_id: user && user.id,
        paid_out_at: DateTime.utc_now() |> DateTime.truncate(:second)
      })
      |> Repo.update()
      |> case do
        {:ok, distribution} -> {:ok, Repo.preload(distribution, @audit_assocs)}
        other -> other
      end
    end
  end

  def mark_paid_distribution(%Distribution{}, _user), do: {:error, :invalid_transition}

  # Freezes the current shareholders table into snapshot rows so later
  # share-count changes cannot rewrite a finalized distribution's dividends.
  defp snapshot_shareholders(distribution) do
    for shareholder <- People.list_shareholders() do
      %DistributionShareholder{}
      |> DistributionShareholder.changeset(%{
        distribution_id: distribution.id,
        shareholder_id: shareholder.id,
        name: shareholder.name,
        shares: shareholder.shares
      })
      |> Repo.insert!()
    end

    :ok
  end

  @doc """
  Snapshots an employee group into a distribution: copies the group name and
  one member row per current member of the source group.
  """
  def add_group(%Distribution{} = distribution, attrs, user) do
    with :ok <- ensure_drafted(distribution),
         :ok <- ensure_owner(distribution, user),
         %EmployeeGroup{} = group <- find_employee_group(attrs["employee_group_id"]) do
      Repo.transaction(fn ->
        dist_group =
          %DistributionGroup{}
          |> DistributionGroup.create_changeset(%{
            distribution_id: distribution.id,
            employee_group_id: group.id,
            name: group.name,
            allocation_pct: attrs["allocation_pct"] || 0
          })
          |> Repo.insert!()

        group = Repo.preload(group, employees: from(e in Employee, order_by: e.name))

        for employee <- group.employees do
          %DistributionGroupMember{}
          |> DistributionGroupMember.create_changeset(%{
            distribution_group_id: dist_group.id,
            employee_id: employee.id,
            employee_name: employee.name,
            hours: 0,
            performance_multiplier: 100
          })
          |> Repo.insert!()
        end

        Repo.preload(dist_group, :members)
      end)
    else
      nil -> {:error, :employee_group_not_found}
      other -> other
    end
  end

  defp find_employee_group(nil), do: nil
  defp find_employee_group(id), do: Repo.get(EmployeeGroup, id)

  def get_distribution_group!(id) do
    DistributionGroup
    |> Repo.get!(id)
    |> Repo.preload([:members, :distribution])
  end

  def update_distribution_group(%DistributionGroup{} = dist_group, attrs, user) do
    dist_group = Repo.preload(dist_group, :distribution)

    with :ok <- ensure_drafted(dist_group.distribution),
         :ok <- ensure_owner(dist_group.distribution, user) do
      dist_group
      |> DistributionGroup.update_changeset(attrs)
      |> Repo.update()
    end
  end

  def delete_distribution_group(%DistributionGroup{} = dist_group, user) do
    dist_group = Repo.preload(dist_group, :distribution)

    with :ok <- ensure_drafted(dist_group.distribution),
         :ok <- ensure_owner(dist_group.distribution, user) do
      Repo.delete(dist_group)
    end
  end

  def get_member!(id) do
    DistributionGroupMember
    |> Repo.get!(id)
    |> Repo.preload(distribution_group: :distribution)
  end

  def update_member(%DistributionGroupMember{} = member, attrs, user) do
    member = Repo.preload(member, distribution_group: :distribution)

    with :ok <- ensure_drafted(member.distribution_group.distribution),
         :ok <- ensure_owner(member.distribution_group.distribution, user) do
      member
      |> DistributionGroupMember.update_changeset(attrs)
      |> Repo.update()
    end
  end

  def get_special_bonus!(id) do
    DistributionSpecialBonus
    |> Repo.get!(id)
    |> Repo.preload([:employee, :distribution])
  end

  def add_special_bonus(%Distribution{} = distribution, attrs, user) do
    with :ok <- ensure_drafted(distribution),
         :ok <- ensure_owner(distribution, user) do
      %DistributionSpecialBonus{}
      |> DistributionSpecialBonus.changeset(%{
        distribution_id: distribution.id,
        employee_id: attrs["employee_id"],
        amount: attrs["amount"],
        note: attrs["note"],
        name: attrs["name"]
      })
      |> Repo.insert()
    end
  end

  def delete_special_bonus(%DistributionSpecialBonus{} = special_bonus, user) do
    special_bonus = Repo.preload(special_bonus, :distribution)

    with :ok <- ensure_drafted(special_bonus.distribution),
         :ok <- ensure_owner(special_bonus.distribution, user) do
      Repo.delete(special_bonus)
    end
  end

  defp ensure_drafted(%Distribution{status: "drafted"}), do: :ok
  defp ensure_drafted(%Distribution{}), do: {:error, :not_drafted}

  # Legacy rows imported before ownership existed (created_by_id nil) stay
  # editable by anyone; owned rows only by their creator.
  defp ensure_owner(%Distribution{created_by_id: nil}, _user), do: :ok

  defp ensure_owner(%Distribution{created_by_id: created_by_id}, %User{id: user_id})
       when created_by_id == user_id,
       do: :ok

  defp ensure_owner(%Distribution{}, _user), do: {:error, :not_owner}

  ## Suggestions

  def list_suggestions(%Distribution{} = distribution) do
    Repo.all(
      from s in DistributionSuggestion,
        where: s.distribution_id == ^distribution.id,
        order_by: [desc: s.inserted_at],
        preload: :user
    )
  end

  def get_suggestion!(id) do
    DistributionSuggestion
    |> Repo.get!(id)
    |> Repo.preload([:user, distribution: @full_preloads])
  end

  @doc """
  Creates or replaces the user's suggestion set on a drafted distribution.
  Owners cannot suggest on their own distribution (they can edit directly).
  """
  def upsert_suggestion(%Distribution{} = distribution, %User{} = user, attrs) do
    with :ok <- ensure_drafted(distribution),
         :ok <- ensure_not_owner(distribution, user) do
      %DistributionSuggestion{}
      |> DistributionSuggestion.changeset(%{
        "explanation" => attrs["explanation"],
        "changes" => attrs["changes"] || %{}
      })
      |> Ecto.Changeset.put_change(:distribution_id, distribution.id)
      |> Ecto.Changeset.put_change(:user_id, user.id)
      |> Repo.insert(
        on_conflict: {:replace, [:explanation, :changes, :updated_at]},
        conflict_target: [:distribution_id, :user_id]
      )
      |> case do
        {:ok, _inserted} ->
          # On conflict the existing row keeps its id; reload by the unique key
          # so callers always get the persisted row.
          suggestion =
            Repo.get_by!(DistributionSuggestion,
              distribution_id: distribution.id,
              user_id: user.id
            )

          {:ok, Repo.preload(suggestion, :user)}

        {:error, changeset} ->
          {:error, changeset}
      end
    end
  end

  def delete_suggestion(%DistributionSuggestion{} = suggestion, %User{} = user) do
    if suggestion.user_id == user.id do
      Repo.delete(suggestion)
    else
      {:error, :not_owner}
    end
  end

  defp ensure_not_owner(%Distribution{created_by_id: created_by_id}, %User{id: user_id})
       when created_by_id == user_id,
       do: {:error, :owner_cannot_suggest}

  defp ensure_not_owner(%Distribution{}, %User{}), do: :ok

  @doc """
  Overlays a suggestion's `changes` map onto a fully-preloaded distribution
  (same preloads as `get_distribution_full!/1`), returning a modified struct
  without persisting anything. Suggested special bonuses are appended as
  unpersisted structs.
  """
  def apply_changes(%Distribution{} = distribution, changes) when is_map(changes) do
    distribution
    |> apply_distribution_changes(changes["distribution"] || %{})
    |> apply_group_changes(changes["groups"] || %{})
    |> apply_member_changes(changes["members"] || %{})
    |> apply_special_bonus_changes(changes["special_bonuses"] || [])
  end

  @doc """
  Computes the breakdown of a fully-preloaded distribution with `changes`
  overlaid, using the live shareholders table — the same inputs as the live
  preview path (`DistributionController.computation`).
  """
  def simulate(%Distribution{} = distribution, changes) do
    distribution
    |> apply_changes(changes)
    |> Calculator.compute(People.list_shareholders())
  end

  defp apply_distribution_changes(distribution, dist_changes) do
    Enum.reduce(dist_changes, distribution, fn
      {"bonus_budget", value}, acc -> %{acc | bonus_budget: to_decimal(value)}
      {"dividends_budget", value}, acc -> %{acc | dividends_budget: to_decimal(value)}
      {"impact_weight", value}, acc -> %{acc | impact_weight: to_integer(value)}
      {"effort_weight", value}, acc -> %{acc | effort_weight: to_integer(value)}
      _, acc -> acc
    end)
  end

  defp apply_group_changes(distribution, group_changes) do
    groups =
      Enum.map(distribution.distribution_groups, fn group ->
        case Map.get(group_changes, group.id) do
          nil ->
            group

          changes ->
            Enum.reduce(changes, group, fn
              {"allocation_pct", value}, acc -> %{acc | allocation_pct: to_decimal(value)}
              {"impact_weight", value}, acc -> %{acc | impact_weight: to_integer(value)}
              {"effort_weight", value}, acc -> %{acc | effort_weight: to_integer(value)}
              _, acc -> acc
            end)
        end
      end)

    %{distribution | distribution_groups: groups}
  end

  defp apply_member_changes(distribution, member_changes) do
    groups =
      Enum.map(distribution.distribution_groups, fn group ->
        members =
          Enum.map(group.members, fn member ->
            case Map.get(member_changes, member.id) do
              nil ->
                member

              changes ->
                Enum.reduce(changes, member, fn
                  {"hours", value}, acc ->
                    %{acc | hours: to_decimal(value)}

                  {"performance_multiplier", value}, acc ->
                    %{acc | performance_multiplier: to_decimal(value)}

                  {"note", value}, acc ->
                    %{acc | note: value}

                  _, acc ->
                    acc
                end)
            end
          end)

        %{group | members: members}
      end)

    %{distribution | distribution_groups: groups}
  end

  defp apply_special_bonus_changes(distribution, bonus_changes) do
    suggested =
      Enum.map(bonus_changes, fn bonus ->
        employee_id = bonus["employee_id"]

        %DistributionSpecialBonus{
          id: Ecto.UUID.generate(),
          distribution_id: distribution.id,
          employee_id: employee_id,
          employee: employee_id && Repo.get(Employee, employee_id),
          name: bonus["name"],
          amount: to_decimal(bonus["amount"] || 0),
          note: bonus["note"]
        }
      end)

    %{distribution | special_bonuses: distribution.special_bonuses ++ suggested}
  end

  defp to_decimal(nil), do: nil
  defp to_decimal(%Decimal{} = value), do: value
  defp to_decimal(value) when is_integer(value), do: Decimal.new(value)
  defp to_decimal(value) when is_float(value), do: Decimal.from_float(value)
  defp to_decimal(value) when is_binary(value), do: Decimal.new(value)

  defp to_integer(value) when is_integer(value), do: value
  defp to_integer(value) when is_float(value), do: trunc(value)
  defp to_integer(value) when is_binary(value), do: String.to_integer(value)
end
