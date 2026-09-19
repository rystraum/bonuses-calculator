defmodule BonusCalculatorBackend.SeedImportTest do
  use BonusCalculatorBackend.DataCase, async: true

  alias BonusCalculatorBackend.{Accounts, Calculator, Distributions, People, SeedImport}

  setup do
    {:ok, user} = Accounts.create_user(%{"username" => "uploader", "password" => "secret123"})
    %{user: user}
  end

  defp fixture do
    %{
      "version" => 1,
      "employees" => ["Alice", "Bob", "Carol"],
      "groups" => [%{"name" => "Engineering", "members" => ["Alice", "Bob"]}],
      "shareholders" => [
        %{"name" => "Alice", "shares" => 100, "employee_name" => "Alice"},
        %{"name" => "Holdings Co", "shares" => 300}
      ],
      "distributions" => [
        %{
          "name" => "Q1 Historical",
          "status" => "paid_out",
          "include_shareholders" => true,
          "dividends_budget" => 4000,
          "bonus_budget" => 10000,
          "rounding_step" => 10,
          "shareholders" => [
            %{"name" => "Alice", "shares" => 100},
            %{"name" => "Holdings Co", "shares" => 300}
          ],
          "groups" => [
            %{
              "name" => "Engineering",
              "budget" => 8000,
              "impact_weight" => 75,
              "effort_weight" => 25,
              "members" => [
                %{
                  "employee_name" => "Alice",
                  "hours" => 100,
                  "performance_multiplier" => 200,
                  "note" => "carried the quarter",
                  "impact_amount" => "3000.25",
                  "effort_amount" => "1000.75"
                },
                %{"employee_name" => "Bob", "hours" => 100, "performance_multiplier" => 200}
              ]
            }
          ],
          "special_bonuses" => [
            %{"employee_name" => "Carol", "amount" => 500, "note" => "referral"},
            %{"employee_name" => "External Consultant", "amount" => 250, "note" => nil}
          ]
        }
      ]
    }
  end

  test "imports the full structure and computes from snapshots", %{user: user} do
    assert {:ok, stats} = SeedImport.import_payload(fixture(), user)

    assert stats == %{
             employees_created: 3,
             groups_created: 1,
             shareholders_created: 2,
             distributions_created: 1,
             distributions_skipped: 0
           }

    distribution = Distributions.get_distribution_full!(by_name("Q1 Historical").id)

    # Audit fields point at the uploader; paid_out implies finalized too.
    assert distribution.status == "paid_out"
    assert distribution.created_by.id == user.id
    assert distribution.finalized_by.id == user.id
    assert distribution.paid_out_by.id == user.id
    assert distribution.finalized_at
    assert distribution.paid_out_at

    # Group snapshot with allocation pct derived from budget and weight overrides.
    assert [group] = distribution.distribution_groups
    assert group.name == "Engineering"
    assert Decimal.eq?(group.allocation_pct, Decimal.new("80.0000"))
    assert group.impact_weight == 75
    assert group.effort_weight == 25

    members = Map.new(group.members, &{&1.employee_name, &1})
    assert members["Alice"].note == "carried the quarter"
    assert members["Bob"].note == nil
    assert Decimal.eq?(members["Alice"].performance_multiplier, Decimal.new(200))
    assert Decimal.eq?(members["Alice"].impact_amount, Decimal.new("3000.25"))
    assert Decimal.eq?(members["Alice"].effort_amount, Decimal.new("1000.75"))
    assert members["Bob"].impact_amount == nil
    assert members["Bob"].effort_amount == nil

    # Dividend shareholder snapshot rows.
    snapshots = Map.new(distribution.distribution_shareholders, &{&1.name, &1})
    assert snapshots["Alice"].shares == 100
    assert snapshots["Holdings Co"].shares == 300
    assert snapshots["Alice"].shareholder_id
    assert snapshots["Holdings Co"].shareholder_id

    # Special bonuses: matched employee vs free-text name.
    bonuses = Enum.sort_by(distribution.special_bonuses, &Decimal.to_float(&1.amount))
    assert [external, carol] = bonuses

    assert carol.employee_id ==
             People.list_employees() |> Enum.find(&(&1.name == "Carol")) |> Map.fetch!(:id)

    assert carol.name == nil
    assert external.employee_id == nil
    assert external.name == "External Consultant"

    # Computation uses the per-group weight overrides and the dividend snapshot.
    result = Calculator.compute(distribution, People.list_shareholders())
    [computed_group] = result.groups
    assert computed_group.group_budget == "8000.0000"
    assert computed_group.impact_budget == "6000.0000"
    assert computed_group.effort_budget == "2000.0000"

    # Alice's sheet-exact overrides pass through verbatim; Bob is computed.
    computed_members = Map.new(computed_group.members, &{&1.employee_name, &1})
    assert computed_members["Alice"].impact_amount == "3000.25"
    assert computed_members["Alice"].effort_amount == "1000.75"
    assert Decimal.eq?(Decimal.new(computed_members["Alice"].total), Decimal.new("4001.00"))
    assert computed_members["Bob"].impact_amount == "3000.0000"
    assert computed_members["Bob"].effort_amount == "1000.0000"

    # With overrides present, displayed rates derive from the amount sums.
    assert computed_group.peso_per_impact == "15.00"
    assert computed_group.peso_per_hour == "10.00"

    payouts = Map.new(result.dividends.payouts, &{&1.shareholder_name, &1})
    assert payouts["Alice"].amount == "1000"
    assert payouts["Holdings Co"].amount == "3000"
    assert payouts["Holdings Co"].employee_id == nil
    assert payouts["Alice"].employee_id == members["Alice"].employee_id

    # Later share-count changes must not rewrite historical dividends.
    alice_shareholder = People.list_shareholders() |> Enum.find(&(&1.name == "Alice"))
    {:ok, _} = People.update_shareholder(alice_shareholder, %{"shares" => 999})

    result = Calculator.compute(distribution, People.list_shareholders())
    payouts = Map.new(result.dividends.payouts, &{&1.shareholder_name, &1})
    assert payouts["Alice"].amount == "1000"
    assert result.dividends.total_shares == 400
  end

  test "drafted distributions drop sheet-exact amount overrides", %{user: user} do
    payload =
      fixture()
      |> put_in(["distributions"], [
        %{
          "name" => "Q2 Draft",
          "status" => "drafted",
          "bonus_budget" => 10000,
          "groups" => [
            %{
              "name" => "Engineering",
              "budget" => 10000,
              "members" => [
                %{
                  "employee_name" => "Alice",
                  "hours" => 100,
                  "performance_multiplier" => 100,
                  "impact_amount" => "3000.25",
                  "effort_amount" => "1000.75"
                }
              ]
            }
          ]
        }
      ])

    assert {:ok, _} = SeedImport.import_payload(payload, user)

    distribution = Distributions.get_distribution_full!(by_name("Q2 Draft").id)
    [group] = distribution.distribution_groups
    [member] = group.members
    assert member.impact_amount == nil
    assert member.effort_amount == nil

    # Amounts are computed live from the budget instead of the sheet values.
    result = Calculator.compute(distribution, People.list_shareholders())
    [computed_member] = hd(result.groups).members
    refute computed_member.impact_amount == "3000.25"
    refute computed_member.effort_amount == "1000.75"
  end

  test "reimporting skips existing distributions and recreates nothing", %{user: user} do
    assert {:ok, _} = SeedImport.import_payload(fixture(), user)
    assert {:ok, stats} = SeedImport.import_payload(fixture(), user)

    assert stats == %{
             employees_created: 0,
             groups_created: 0,
             shareholders_created: 0,
             distributions_created: 0,
             distributions_skipped: 1
           }

    assert length(Distributions.list_distributions()) == 1
  end

  test "rejects unsupported versions", %{user: user} do
    assert {:error, :unsupported_version} = SeedImport.import_payload(%{"version" => 2}, user)
  end

  test "accepts employees as bare names or {name, classification} objects", %{user: user} do
    payload = %{
      "version" => 1,
      "employees" => [
        "Alice",
        %{"name" => "Bob", "classification" => "contractual"},
        %{"name" => "Carol", "classification" => nil}
      ]
    }

    assert {:ok, stats} = SeedImport.import_payload(payload, user)
    assert stats.employees_created == 3

    by_name = Map.new(People.list_employees(), &{&1.name, &1})
    assert by_name["Alice"].classification == nil
    assert by_name["Bob"].classification == "contractual"
    assert by_name["Carol"].classification == nil
  end

  defp by_name(name), do: Repo.get_by!(Distributions.Distribution, name: name)
end
