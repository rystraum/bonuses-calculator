defmodule BonusCalculatorBackend.SeedImport do
  @moduledoc """
  Imports historical payout data (`POST /api/seed_upload`, format version 1)
  in a single DB transaction.

  Distributions are inserted directly in their given status, bypassing the
  drafted-only mutation guard — this is an importer, so snapshot rows
  (distribution groups, members, shareholders, special bonuses) are built
  inline. A distribution whose name already exists is skipped.
  """

  alias BonusCalculatorBackend.Accounts.User

  alias BonusCalculatorBackend.Distributions.{
    Distribution,
    DistributionGroup,
    DistributionGroupMember,
    DistributionShareholder,
    DistributionSpecialBonus
  }

  alias BonusCalculatorBackend.Groups
  alias BonusCalculatorBackend.Groups.{EmployeeGroup, EmployeeGroupMembership}
  alias BonusCalculatorBackend.People.{Employee, Shareholder}
  alias BonusCalculatorBackend.Repo

  @stat_keys [
    :employees_created,
    :groups_created,
    :shareholders_created,
    :distributions_created,
    :distributions_skipped
  ]

  def import_payload(%{"version" => 1} = payload, %User{} = user) do
    Repo.transaction(fn ->
      state = %{
        stats: Map.new(@stat_keys, &{&1, 0}),
        employees: %{},
        groups: %{},
        shareholders: %{}
      }

      state =
        payload
        |> Map.get("employees", [])
        |> Enum.reduce(state, fn name, state ->
          {state, _employee} = find_or_create_employee(state, name)
          state
        end)

      state =
        payload
        |> Map.get("groups", [])
        |> Enum.reduce(state, &import_employee_group/2)

      state =
        payload
        |> Map.get("shareholders", [])
        |> Enum.reduce(state, &import_shareholder/2)

      state =
        payload
        |> Map.get("distributions", [])
        |> Enum.reduce(state, &import_distribution(&1, &2, user))

      state.stats
    end)
  end

  def import_payload(_payload, %User{}), do: {:error, :unsupported_version}

  defp import_employee_group(spec, state) do
    {state, group} = find_or_create_employee_group(state, spec["name"])

    Enum.reduce(spec["members"] || [], state, fn member_name, state ->
      {state, employee} = find_or_create_employee(state, member_name)
      ensure_membership(group, employee)
      state
    end)
  end

  defp import_shareholder(spec, state) do
    {state, employee} =
      case spec["employee_name"] do
        nil -> {state, nil}
        name -> find_or_create_employee(state, name)
      end

    employee_id = employee && employee.id

    case state.shareholders[spec["name"]] || Repo.get_by(Shareholder, name: spec["name"]) do
      nil ->
        shareholder =
          %Shareholder{}
          |> Shareholder.changeset(%{
            name: spec["name"],
            shares: spec["shares"],
            employee_id: employee_id
          })
          |> Repo.insert!()

        state |> cache_shareholder(shareholder) |> bump(:shareholders_created)

      shareholder ->
        # Latest shares value wins.
        {:ok, shareholder} =
          shareholder
          |> Shareholder.changeset(%{shares: spec["shares"], employee_id: employee_id})
          |> Repo.update()

        cache_shareholder(state, shareholder)
    end
  end

  defp import_distribution(spec, state, user) do
    if Repo.get_by(Distribution, name: spec["name"]) do
      bump(state, :distributions_skipped)
    else
      now = DateTime.utc_now() |> DateTime.truncate(:second)
      status = spec["status"] || "drafted"

      distribution =
        %Distribution{}
        |> Distribution.changeset(%{
          "name" => spec["name"],
          "include_shareholders" => spec["include_shareholders"] || false,
          "dividends_budget" => spec["dividends_budget"] || 0,
          "bonus_budget" => spec["bonus_budget"] || 0,
          "rounding_step" => spec["rounding_step"] || 10
        })
        |> Ecto.Changeset.put_change(:status, status)
        |> Ecto.Changeset.put_change(:created_by_id, user.id)
        |> put_audit_fields(status, user, now)
        |> Repo.insert!()

      state =
        spec["groups"]
        |> Kernel.||([])
        |> Enum.reduce(state, &import_distribution_group(&1, &2, distribution))

      Enum.each(spec["shareholders"] || [], fn shareholder_spec ->
        shareholder =
          state.shareholders[shareholder_spec["name"]] ||
            Repo.get_by(Shareholder, name: shareholder_spec["name"])

        %DistributionShareholder{}
        |> DistributionShareholder.changeset(%{
          distribution_id: distribution.id,
          shareholder_id: shareholder && shareholder.id,
          name: shareholder_spec["name"],
          shares: shareholder_spec["shares"]
        })
        |> Repo.insert!()
      end)

      state =
        Enum.reduce(spec["special_bonuses"] || [], state, fn bonus_spec, state ->
          {state, employee} = find_employee(state, bonus_spec["employee_name"])

          %DistributionSpecialBonus{}
          |> DistributionSpecialBonus.changeset(%{
            distribution_id: distribution.id,
            employee_id: employee && employee.id,
            name: if(employee, do: nil, else: bonus_spec["employee_name"]),
            amount: bonus_spec["amount"],
            note: bonus_spec["note"]
          })
          |> Repo.insert!()

          state
        end)

      bump(state, :distributions_created)
    end
  end

  defp import_distribution_group(spec, state, distribution) do
    employee_group =
      case spec["name"] do
        nil -> nil
        name -> state.groups[name] || Repo.get_by(EmployeeGroup, name: name)
      end

    dist_group =
      %DistributionGroup{}
      |> DistributionGroup.create_changeset(%{
        distribution_id: distribution.id,
        employee_group_id: employee_group && employee_group.id,
        name: spec["name"],
        allocation_pct: allocation_pct(spec["budget"] || 0, distribution.bonus_budget),
        impact_weight: spec["impact_weight"],
        effort_weight: spec["effort_weight"]
      })
      |> Repo.insert!()

    Enum.reduce(spec["members"] || [], state, fn member_spec, state ->
      {state, employee} = find_or_create_employee(state, member_spec["employee_name"])

      %DistributionGroupMember{}
      |> DistributionGroupMember.create_changeset(%{
        distribution_group_id: dist_group.id,
        employee_id: employee.id,
        employee_name: employee.name,
        hours: member_spec["hours"] || 0,
        performance_multiplier: member_spec["performance_multiplier"] || 100,
        note: member_spec["note"],
        impact_amount: member_spec["impact_amount"],
        effort_amount: member_spec["effort_amount"]
      })
      |> Repo.insert!()

      state
    end)
  end

  defp allocation_pct(_budget, bonus_budget) when bonus_budget in [nil, 0], do: Decimal.new(0)

  defp allocation_pct(budget, %Decimal{} = bonus_budget) do
    if Decimal.eq?(bonus_budget, Decimal.new(0)) do
      Decimal.new(0)
    else
      Decimal.new(budget)
      |> Decimal.div(bonus_budget)
      |> Decimal.mult(Decimal.new(100))
      |> Decimal.round(4)
    end
  end

  defp put_audit_fields(changeset, status, user, now) do
    changeset =
      if status in ["finalized", "paid_out"] do
        changeset
        |> Ecto.Changeset.put_change(:finalized_by_id, user.id)
        |> Ecto.Changeset.put_change(:finalized_at, now)
      else
        changeset
      end

    if status == "paid_out" do
      changeset
      |> Ecto.Changeset.put_change(:paid_out_by_id, user.id)
      |> Ecto.Changeset.put_change(:paid_out_at, now)
    else
      changeset
    end
  end

  defp find_or_create_employee(state, name) do
    case find_employee(state, name) do
      {state, %Employee{} = employee} ->
        {state, employee}

      {state, nil} ->
        employee =
          %Employee{}
          |> Employee.changeset(%{name: name})
          |> Repo.insert!()

        state = state |> put_in([:employees, name], employee) |> bump(:employees_created)
        {state, employee}
    end
  end

  defp find_employee(state, nil), do: {state, nil}

  defp find_employee(state, name) do
    case state.employees[name] do
      %Employee{} = employee ->
        {state, employee}

      nil ->
        case Repo.get_by(Employee, name: name) do
          nil -> {state, nil}
          employee -> {put_in(state, [:employees, name], employee), employee}
        end
    end
  end

  defp find_or_create_employee_group(state, name) do
    case state.groups[name] do
      %EmployeeGroup{} = group ->
        {state, group}

      nil ->
        case Repo.get_by(EmployeeGroup, name: name) do
          nil ->
            {:ok, group} = Groups.create_employee_group(%{"name" => name})

            state = state |> put_in([:groups, name], group) |> bump(:groups_created)
            {state, group}

          group ->
            {put_in(state, [:groups, name], group), group}
        end
    end
  end

  # Adds the employee to the group's memberships unless already a member;
  # existing members are never removed.
  defp ensure_membership(group, employee) do
    case Repo.get_by(EmployeeGroupMembership,
           employee_group_id: group.id,
           employee_id: employee.id
         ) do
      nil -> {:ok, _membership} = Groups.add_member(group, employee.id)
      _membership -> :ok
    end
  end

  defp cache_shareholder(state, shareholder) do
    put_in(state, [:shareholders, shareholder.name], shareholder)
  end

  defp bump(state, key), do: update_in(state, [:stats, key], &(&1 + 1))
end
