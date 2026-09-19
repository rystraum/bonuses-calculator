defmodule BonusCalculatorBackend.CalculatorTest do
  use BonusCalculatorBackend.DataCase, async: true

  alias BonusCalculatorBackend.{Calculator, Distributions, Groups, People}

  setup do
    sample_scenario()
  end

  defp sample_scenario do
    {:ok, p1} = People.create_employee(%{"name" => "Person1"})
    {:ok, p2} = People.create_employee(%{"name" => "Person2"})
    {:ok, p3} = People.create_employee(%{"name" => "Person3"})
    {:ok, p4} = People.create_employee(%{"name" => "Person4"})

    {:ok, _sh3} =
      People.create_shareholder(%{"name" => "Person3", "shares" => 60, "employee_id" => p3.id})

    {:ok, sh4} = People.create_shareholder(%{"name" => "Person4", "shares" => 40})

    {:ok, group_a} = Groups.create_employee_group(%{"name" => "Group A"})
    {:ok, group_b} = Groups.create_employee_group(%{"name" => "Group B"})

    {:ok, _} = Groups.add_member(group_a, p1.id)
    {:ok, _} = Groups.add_member(group_a, p2.id)
    {:ok, _} = Groups.add_member(group_b, p1.id)
    {:ok, _} = Groups.add_member(group_b, p3.id)

    {:ok, distribution} =
      Distributions.create_distribution(%{
        "name" => "Sample",
        "include_shareholders" => true,
        "bonus_budget" => "100000",
        "dividends_budget" => "100000",
        "effort_weight" => 40,
        "impact_weight" => 60,
        "rounding_step" => 100
      })

    {:ok, dist_a} =
      Distributions.add_group(distribution, %{
        "employee_group_id" => group_a.id,
        "allocation_pct" => "40"
      })

    {:ok, dist_b} =
      Distributions.add_group(distribution, %{
        "employee_group_id" => group_b.id,
        "allocation_pct" => "60"
      })

    set_member = fn dist_group, employee_id, hours, multiplier ->
      member = Enum.find(dist_group.members, &(&1.employee_id == employee_id))

      {:ok, _} =
        Distributions.update_member(member, %{
          "hours" => hours,
          "performance_multiplier" => multiplier
        })
    end

    set_member.(dist_a, p1.id, "100", "50")
    set_member.(dist_a, p2.id, "50", "100")
    set_member.(dist_b, p1.id, "100", "100")
    set_member.(dist_b, p3.id, "100", "100")

    %{p1: p1, p2: p2, p3: p3, p4: p4, sh4: sh4, distribution: distribution}
  end

  test "matches the sample computation exactly", ctx do
    distribution = Distributions.get_distribution_full!(ctx.distribution.id)
    result = Calculator.compute(distribution, People.list_shareholders())

    [group_a, group_b] = result.groups

    # Group A: budget 40,000; impact 24,000; effort 16,000
    assert group_a.name == "Group A"
    assert group_a.group_budget == "40000"
    assert group_a.impact_budget == "24000"
    assert group_a.effort_budget == "16000"
    assert group_a.total_multiplier == "150"
    assert group_a.total_hours == "150"
    assert group_a.peso_per_impact == "160"
    assert group_a.peso_per_hour == "100"

    [a1, a2] = group_a.members
    assert a1.employee_id == ctx.p1.id
    assert a1.impact_amount == "8000"
    assert a1.effort_amount == "10000"
    assert a1.total == "18000"
    assert a2.employee_id == ctx.p2.id
    assert a2.impact_amount == "16000"
    assert a2.effort_amount == "5000"
    assert a2.total == "21000"

    # Group B: budget 60,000; impact 36,000; effort 24,000
    assert group_b.group_budget == "60000"
    assert group_b.impact_budget == "36000"
    assert group_b.effort_budget == "24000"
    assert group_b.peso_per_impact == "180"
    assert group_b.peso_per_hour == "120"

    for member <- group_b.members do
      assert member.impact_amount == "18000"
      assert member.effort_amount == "12000"
      assert member.total == "30000"
    end

    # Dividends
    assert result.dividends.budget == "100000"
    assert result.dividends.total_shares == 100

    payouts_by_employee = Map.new(result.dividends.payouts, &{&1.shareholder_name, &1})
    assert payouts_by_employee["Person3"].amount == "60000"
    assert payouts_by_employee["Person3"].employee_id == ctx.p3.id
    assert payouts_by_employee["Person4"].amount == "40000"
    assert payouts_by_employee["Person4"].employee_id == nil

    # Persons rollup
    persons = Map.new(result.persons, &{&1.name, &1})
    assert persons["Person1"].total == "48000"
    assert persons["Person2"].total == "21000"
    assert persons["Person3"].total == "90000"
    assert persons["Person3"].employee_id == ctx.p3.id
    assert persons["Person4"].total == "40000"
    assert persons["Person4"].shareholder_id == ctx.sh4.id
    assert persons["Person4"].employee_id == nil

    p1_types = Enum.map(persons["Person1"].breakdown, & &1.type) |> Enum.sort()
    assert p1_types == ["effort", "effort", "impact", "impact"]

    assert [%{type: "dividend", amount: "60000", group_name: nil}] =
             Enum.filter(persons["Person3"].breakdown, &(&1.type == "dividend"))

    # Totals
    assert result.totals.bonus_budget == "100000"
    assert result.totals.computed_bonus_total == "99000"
    assert result.totals.special_bonuses_total == "0"
    assert result.totals.dividends_budget == "100000"
    assert result.totals.computed_dividends_total == "100000"
    assert result.totals.grand_total == "199000"
    assert result.totals.within_tolerance == true
  end

  test "dividends are null when include_shareholders is false", ctx do
    {:ok, distribution} =
      Distributions.update_distribution(ctx.distribution, %{"include_shareholders" => false})

    distribution = Distributions.get_distribution_full!(distribution.id)
    result = Calculator.compute(distribution, People.list_shareholders())

    assert result.dividends == nil
    assert result.totals.computed_dividends_total == "0"

    persons = Map.new(result.persons, &{&1.name, &1})
    assert persons["Person1"].total == "48000"
    assert persons["Person3"].total == "30000"
    refute Map.has_key?(persons, "Person4")
  end

  test "zero budgets and empty groups compute to zero without divide errors" do
    {:ok, distribution} =
      Distributions.create_distribution(%{
        "name" => "Empty",
        "bonus_budget" => "0",
        "dividends_budget" => "0"
      })

    distribution = Distributions.get_distribution_full!(distribution.id)
    result = Calculator.compute(distribution, [])

    assert result.totals.grand_total == "0"
    assert result.totals.within_tolerance == true
  end
end
