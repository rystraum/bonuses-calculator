defmodule BonusCalculatorBackend.Calculator do
  @moduledoc """
  Pure computation of a distribution's full bonus/dividend breakdown from its
  snapshotted data (distribution groups, members, special bonuses) plus the
  global shareholders table.

  Used both for the live preview and the finalized read-only view — inputs are
  snapshotted, so results are stable.

  ## Decimal encoding

  All monetary amounts, percentages, and rates are returned as strings via
  `Decimal.to_string/2` (`:normal` notation) so no precision is lost in JSON.
  Percentages are rounded to 2 decimal places; dividend amounts are rounded to
  2 decimal places (half-up); all other amounts are exact.
  """

  alias BonusCalculatorBackend.Distributions.Distribution

  @zero Decimal.new(0)
  @hundred Decimal.new(100)

  @doc """
  Computes the breakdown for a `Distribution` that must have
  `distribution_groups` (with `members`) and `special_bonuses` (with
  `employee`) preloaded. `shareholders` is the full list of shareholders
  (with `employee` association irrelevant — only `employee_id` is read).
  """
  def compute(%Distribution{} = distribution, shareholders) when is_list(shareholders) do
    groups = Enum.map(distribution.distribution_groups, &compute_group(&1, distribution))
    dividends = compute_dividends(distribution, shareholders)
    special_bonuses = Enum.map(distribution.special_bonuses, &special_bonus_json/1)
    persons = compute_persons(groups, special_bonuses, dividends)
    totals = compute_totals(distribution, groups, special_bonuses, dividends)

    %{
      distribution: %{
        id: distribution.id,
        name: distribution.name,
        description: distribution.description,
        status: distribution.status,
        include_shareholders: distribution.include_shareholders,
        bonus_budget: dec(distribution.bonus_budget),
        dividends_budget: dec(distribution.dividends_budget),
        effort_weight: distribution.effort_weight,
        impact_weight: distribution.impact_weight,
        rounding_step: distribution.rounding_step
      },
      dividends: dividends,
      groups: groups,
      special_bonuses: special_bonuses,
      persons: persons,
      totals: totals
    }
  end

  defp compute_group(group, distribution) do
    step = Decimal.new(distribution.rounding_step || 10)

    group_budget =
      distribution.bonus_budget
      |> Decimal.mult(group.allocation_pct)
      |> Decimal.div(@hundred)

    impact_budget =
      group_budget
      |> Decimal.mult(Decimal.new(distribution.impact_weight))
      |> Decimal.div(@hundred)

    effort_budget =
      group_budget
      |> Decimal.mult(Decimal.new(distribution.effort_weight))
      |> Decimal.div(@hundred)

    total_multiplier =
      Enum.reduce(group.members, @zero, &Decimal.add(&2, &1.performance_multiplier))

    total_hours = Enum.reduce(group.members, @zero, &Decimal.add(&2, &1.hours))

    peso_per_impact = floor_to_step(safe_div(impact_budget, total_multiplier), step)
    peso_per_hour = floor_to_step(safe_div(effort_budget, total_hours), step)

    members =
      Enum.map(group.members, fn member ->
        impact_amount = Decimal.mult(member.performance_multiplier, peso_per_impact)
        effort_amount = Decimal.mult(member.hours, peso_per_hour)

        %{
          id: member.id,
          employee_id: member.employee_id,
          employee_name: member.employee_name,
          hours: dec(member.hours),
          performance_multiplier: dec(member.performance_multiplier),
          impact_pct: pct(member.performance_multiplier, total_multiplier),
          effort_pct: pct(member.hours, total_hours),
          impact_amount: dec(impact_amount),
          effort_amount: dec(effort_amount),
          total: dec(Decimal.add(impact_amount, effort_amount))
        }
      end)

    %{
      id: group.id,
      name: group.name,
      allocation_pct: dec(group.allocation_pct),
      group_budget: dec(group_budget),
      impact_budget: dec(impact_budget),
      effort_budget: dec(effort_budget),
      total_multiplier: dec(total_multiplier),
      total_hours: dec(total_hours),
      peso_per_impact: dec(peso_per_impact),
      peso_per_hour: dec(peso_per_hour),
      members: members
    }
  end

  defp compute_dividends(%Distribution{include_shareholders: false}, _shareholders), do: nil

  defp compute_dividends(%Distribution{} = distribution, shareholders) do
    total_shares = Enum.reduce(shareholders, 0, &(&2 + &1.shares))

    payouts =
      Enum.map(shareholders, fn shareholder ->
        amount =
          if total_shares > 0 do
            distribution.dividends_budget
            |> Decimal.mult(Decimal.new(shareholder.shares))
            |> Decimal.div(Decimal.new(total_shares))
            |> Decimal.round(2)
            |> Decimal.normalize()
          else
            @zero
          end

        %{
          shareholder_id: shareholder.id,
          shareholder_name: shareholder.name,
          employee_id: shareholder.employee_id,
          shares: shareholder.shares,
          pct: pct(Decimal.new(shareholder.shares), Decimal.new(total_shares)),
          amount: dec(amount)
        }
      end)

    %{
      budget: dec(distribution.dividends_budget),
      total_shares: total_shares,
      payouts: payouts
    }
  end

  defp special_bonus_json(bonus) do
    %{
      id: bonus.id,
      employee_id: bonus.employee_id,
      employee_name: bonus.employee && bonus.employee.name,
      name: bonus.name,
      amount: dec(bonus.amount),
      note: bonus.note
    }
  end

  defp compute_persons(groups, special_bonuses, dividends) do
    persons = %{}

    persons =
      Enum.reduce(groups, persons, fn group, acc ->
        Enum.reduce(group.members, acc, fn member, acc ->
          add_entry(acc, {:employee, member.employee_id}, member.employee_name, [
            %{type: "effort", group_name: group.name, amount: member.effort_amount},
            %{type: "impact", group_name: group.name, amount: member.impact_amount}
          ])
        end)
      end)

    persons =
      Enum.reduce(special_bonuses, persons, fn bonus, acc ->
        # Free-text bonuses (no employee) roll up per bonus row, keyed by id.
        key =
          if bonus.employee_id,
            do: {:employee, bonus.employee_id},
            else: {:special_bonus, bonus.id}

        add_entry(acc, key, bonus.employee_name || bonus.name, [
          %{type: "special_bonus", group_name: nil, amount: bonus.amount}
        ])
      end)

    persons =
      case dividends do
        nil ->
          persons

        %{payouts: payouts} ->
          Enum.reduce(payouts, persons, fn payout, acc ->
            entry = %{type: "dividend", group_name: nil, amount: payout.amount}

            case payout.employee_id do
              nil ->
                add_entry(acc, {:shareholder, payout.shareholder_id}, payout.shareholder_name, [
                  entry
                ])

              employee_id ->
                add_entry(acc, {:employee, employee_id}, payout.shareholder_name, [entry])
            end
          end)
      end

    persons
    |> Enum.map(fn {_key, person} ->
      total =
        Enum.reduce(person.breakdown, @zero, fn entry, sum ->
          Decimal.add(sum, Decimal.new(entry.amount))
        end)

      %{
        employee_id: person.employee_id,
        shareholder_id: person.shareholder_id,
        name: person.name,
        total: dec(total),
        breakdown: person.breakdown
      }
    end)
    |> Enum.sort_by(& &1.name)
  end

  defp add_entry(persons, key, name, entries) do
    person =
      Map.get(persons, key, %{
        employee_id: (match?({:employee, _}, key) && elem(key, 1)) || nil,
        shareholder_id: (match?({:shareholder, _}, key) && elem(key, 1)) || nil,
        name: name,
        breakdown: []
      })

    person = %{person | breakdown: person.breakdown ++ entries}
    # Prefer a non-nil name if we later learn one.
    person = if person.name == nil, do: %{person | name: name}, else: person

    Map.put(persons, key, person)
  end

  defp compute_totals(distribution, groups, special_bonuses, dividends) do
    computed_bonus_total =
      Enum.reduce(groups, @zero, fn group, acc ->
        Enum.reduce(group.members, acc, fn member, sum ->
          sum
          |> Decimal.add(Decimal.new(member.effort_amount))
          |> Decimal.add(Decimal.new(member.impact_amount))
        end)
      end)

    special_bonuses_total =
      Enum.reduce(special_bonuses, @zero, &Decimal.add(&2, Decimal.new(&1.amount)))

    computed_dividends_total =
      case dividends do
        nil ->
          @zero

        %{payouts: payouts} ->
          Enum.reduce(payouts, @zero, &Decimal.add(&2, Decimal.new(&1.amount)))
      end

    grand_total =
      computed_bonus_total
      |> Decimal.add(special_bonuses_total)
      |> Decimal.add(computed_dividends_total)

    tolerance = distribution.bonus_budget |> Decimal.mult(Decimal.new("0.05"))

    within_tolerance =
      Decimal.compare(
        Decimal.abs(Decimal.sub(computed_bonus_total, distribution.bonus_budget)),
        tolerance
      ) != :gt

    %{
      bonus_budget: dec(distribution.bonus_budget),
      computed_bonus_total: dec(computed_bonus_total),
      special_bonuses_total: dec(special_bonuses_total),
      dividends_budget: dec(distribution.dividends_budget),
      computed_dividends_total: dec(computed_dividends_total),
      grand_total: dec(grand_total),
      within_tolerance: within_tolerance
    }
  end

  defp safe_div(numerator, denominator) do
    if Decimal.eq?(denominator, @zero) do
      @zero
    else
      Decimal.div(numerator, denominator)
    end
  end

  # Per the reference sample, exact (whole-number) quotients pass through
  # untouched (24,000 / 150 = 160 stays 160); only fractional quotients are
  # floored down to a multiple of the rounding step (106.66 -> 100).
  defp floor_to_step(amount, step) do
    floored = Decimal.round(amount, 0, :floor)

    cond do
      Decimal.eq?(step, @zero) -> amount
      Decimal.eq?(amount, floored) -> amount
      true -> floored |> Decimal.div(step) |> Decimal.round(0, :floor) |> Decimal.mult(step)
    end
  end

  defp pct(part, total) do
    if Decimal.eq?(total, @zero) do
      dec(@zero)
    else
      part |> Decimal.div(total) |> Decimal.mult(@hundred) |> Decimal.round(2) |> dec()
    end
  end

  defp dec(%Decimal{} = value), do: Decimal.to_string(value, :normal)
  defp dec(value) when is_integer(value), do: Decimal.new(value) |> dec()
end
