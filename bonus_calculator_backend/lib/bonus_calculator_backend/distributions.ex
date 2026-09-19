defmodule BonusCalculatorBackend.Distributions do
  @moduledoc """
  Distributions, their group snapshots, snapshot members, and special bonuses.

  Any mutation on a distribution that is not in "drafted" status is rejected
  with `{:error, :not_drafted}`.
  """

  import Ecto.Query, warn: false

  alias BonusCalculatorBackend.Distributions.{
    Distribution,
    DistributionGroup,
    DistributionGroupMember,
    DistributionShareholder,
    DistributionSpecialBonus
  }

  alias BonusCalculatorBackend.Accounts.User
  alias BonusCalculatorBackend.Groups.EmployeeGroup
  alias BonusCalculatorBackend.People
  alias BonusCalculatorBackend.Repo

  @audit_assocs [:created_by, :finalized_by, :paid_out_by]

  def list_distributions do
    Repo.all(from d in Distribution, order_by: [desc: d.inserted_at], preload: ^@audit_assocs)
  end

  def get_distribution!(id), do: Repo.get!(Distribution, id)

  def get_distribution_full!(id) do
    Distribution
    |> Repo.get!(id)
    |> Repo.preload(
      [
        distribution_groups: :members,
        special_bonuses: :employee,
        distribution_shareholders: :shareholder
      ] ++ @audit_assocs
    )
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

  def update_distribution(%Distribution{} = distribution, attrs) do
    with :ok <- ensure_drafted(distribution) do
      distribution
      |> Distribution.changeset(attrs)
      |> Repo.update()
    end
  end

  def delete_distribution(%Distribution{} = distribution) do
    with :ok <- ensure_drafted(distribution) do
      Repo.delete(distribution)
    end
  end

  def finalize_distribution(distribution, user \\ nil)

  def finalize_distribution(%Distribution{status: "drafted"} = distribution, user) do
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

  def finalize_distribution(%Distribution{}, _user), do: {:error, :invalid_transition}

  def mark_paid_distribution(distribution, user \\ nil)

  def mark_paid_distribution(%Distribution{status: "finalized"} = distribution, user) do
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
  def add_group(%Distribution{} = distribution, attrs) do
    with :ok <- ensure_drafted(distribution),
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

        group = Repo.preload(group, :employees)

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

  def update_distribution_group(%DistributionGroup{} = dist_group, attrs) do
    dist_group = Repo.preload(dist_group, :distribution)

    with :ok <- ensure_drafted(dist_group.distribution) do
      dist_group
      |> DistributionGroup.update_changeset(attrs)
      |> Repo.update()
    end
  end

  def delete_distribution_group(%DistributionGroup{} = dist_group) do
    dist_group = Repo.preload(dist_group, :distribution)

    with :ok <- ensure_drafted(dist_group.distribution) do
      Repo.delete(dist_group)
    end
  end

  def get_member!(id) do
    DistributionGroupMember
    |> Repo.get!(id)
    |> Repo.preload(distribution_group: :distribution)
  end

  def update_member(%DistributionGroupMember{} = member, attrs) do
    member = Repo.preload(member, distribution_group: :distribution)

    with :ok <- ensure_drafted(member.distribution_group.distribution) do
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

  def add_special_bonus(%Distribution{} = distribution, attrs) do
    with :ok <- ensure_drafted(distribution) do
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

  def delete_special_bonus(%DistributionSpecialBonus{} = special_bonus) do
    special_bonus = Repo.preload(special_bonus, :distribution)

    with :ok <- ensure_drafted(special_bonus.distribution) do
      Repo.delete(special_bonus)
    end
  end

  defp ensure_drafted(%Distribution{status: "drafted"}), do: :ok
  defp ensure_drafted(%Distribution{}), do: {:error, :not_drafted}
end
