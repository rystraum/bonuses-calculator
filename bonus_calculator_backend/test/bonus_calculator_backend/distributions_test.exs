defmodule BonusCalculatorBackend.DistributionsTest do
  use BonusCalculatorBackend.DataCase, async: true

  alias BonusCalculatorBackend.{Distributions, Groups, People}
  alias BonusCalculatorBackend.Distributions.Distribution

  setup do
    build_fixture()
  end

  defp build_fixture do
    {:ok, e1} = People.create_employee(%{"name" => "Alice"})
    {:ok, e2} = People.create_employee(%{"name" => "Bob"})
    {:ok, group} = Groups.create_employee_group(%{"name" => "Engineering"})
    {:ok, _} = Groups.add_member(group, e1.id)
    {:ok, _} = Groups.add_member(group, e2.id)

    {:ok, distribution} = Distributions.create_distribution(%{"name" => "Q1 Bonus"})

    %{e1: e1, e2: e2, group: group, distribution: distribution}
  end

  describe "planned_date" do
    test "create and update round-trip planned_date" do
      {:ok, dist} =
        Distributions.create_distribution(%{"name" => "Dated", "planned_date" => "2026-12-15"})

      assert dist.planned_date == ~D[2026-12-15]

      assert {:ok, dist} =
               Distributions.update_distribution(dist, %{"planned_date" => "2027-01-31"})

      assert dist.planned_date == ~D[2027-01-31]

      assert {:ok, dist} = Distributions.update_distribution(dist, %{"planned_date" => nil})
      assert dist.planned_date == nil
    end

    test "planned_date update is blocked after finalize", ctx do
      {:ok, finalized} = Distributions.finalize_distribution(ctx.distribution)

      assert {:error, :not_drafted} =
               Distributions.update_distribution(finalized, %{"planned_date" => "2026-12-15"})
    end
  end

  describe "snapshots" do
    test "adding a group snapshots the name and members", ctx do
      {:ok, dist_group} =
        Distributions.add_group(ctx.distribution, %{
          "employee_group_id" => ctx.group.id,
          "allocation_pct" => "25"
        })

      assert dist_group.name == "Engineering"
      assert Decimal.eq?(dist_group.allocation_pct, Decimal.new("25"))

      members = Enum.sort_by(dist_group.members, & &1.employee_name)

      assert [%{employee_name: "Alice"}, %{employee_name: "Bob"}] =
               Enum.map(members, &Map.take(&1, [:employee_name]))

      for member <- members do
        assert Decimal.eq?(member.hours, Decimal.new(0))
        assert Decimal.eq?(member.performance_multiplier, Decimal.new(100))
      end
    end

    test "snapshot is isolated from later changes to the source group", ctx do
      {:ok, dist_group} =
        Distributions.add_group(ctx.distribution, %{"employee_group_id" => ctx.group.id})

      # Mutate the source group: add a new member, remove one, rename an employee.
      {:ok, e3} = People.create_employee(%{"name" => "Carol"})
      {:ok, _} = Groups.add_member(ctx.group, e3.id)
      {:ok, _} = Groups.remove_member(ctx.group, ctx.e2.id)
      {:ok, _} = People.update_employee(ctx.e1, %{"name" => "Alice Renamed"})
      {:ok, _} = Groups.update_employee_group(ctx.group, %{"name" => "Platform"})

      reloaded = Distributions.get_distribution_group!(dist_group.id)

      assert reloaded.name == "Engineering"
      assert Enum.sort(Enum.map(reloaded.members, & &1.employee_name)) == ["Alice", "Bob"]
    end

    test "deleting a distribution group cascades only its own member rows", ctx do
      {:ok, other_group} = Groups.create_employee_group(%{"name" => "Ops"})
      {:ok, _} = Groups.add_member(other_group, ctx.e1.id)

      {:ok, dist_a} =
        Distributions.add_group(ctx.distribution, %{"employee_group_id" => ctx.group.id})

      {:ok, dist_b} =
        Distributions.add_group(ctx.distribution, %{"employee_group_id" => other_group.id})

      {:ok, _} =
        Distributions.delete_distribution_group(Distributions.get_distribution_group!(dist_a.id))

      reloaded_b = Distributions.get_distribution_group!(dist_b.id)

      assert [%{employee_name: "Alice"}] =
               Enum.map(reloaded_b.members, &Map.take(&1, [:employee_name]))

      full = Distributions.get_distribution_full!(ctx.distribution.id)
      assert Enum.map(full.distribution_groups, & &1.id) == [dist_b.id]
    end
  end

  describe "group/member ordering" do
    test "get_distribution_full! returns members in a stable order across edits and refetches",
         ctx do
      {:ok, _} =
        Distributions.add_group(ctx.distribution, %{"employee_group_id" => ctx.group.id})

      member_ids = fn full ->
        for g <- full.distribution_groups, m <- g.members, do: m.id
      end

      full = Distributions.get_distribution_full!(ctx.distribution.id)
      [group] = full.distribution_groups

      # The contract: alphabetical by snapshotted employee name, matching
      # the order members were snapshotted in (employees are preloaded by
      # name), with id as a deterministic tiebreak.
      assert Enum.map(group.members, & &1.employee_name) == ["Alice", "Bob"]

      expected =
        Enum.sort_by(group.members, &{&1.employee_name, &1.id}) |> Enum.map(& &1.id)

      assert member_ids.(full) == expected

      # Editing a member (which triggers a refetch in the UI) must not reshuffle.
      [member | _] = group.members
      {:ok, _} = Distributions.update_member(member, %{"hours" => "10"})

      assert member_ids.(Distributions.get_distribution_full!(ctx.distribution.id)) == expected
    end
  end

  describe "status transitions and drafted guard" do
    test "finalize then mark_paid; invalid transitions rejected", ctx do
      assert {:error, :invalid_transition} =
               Distributions.mark_paid_distribution(ctx.distribution)

      {:ok, finalized} = Distributions.finalize_distribution(ctx.distribution)
      assert finalized.status == "finalized"

      assert {:error, :invalid_transition} = Distributions.finalize_distribution(finalized)

      {:ok, paid} = Distributions.mark_paid_distribution(finalized)
      assert paid.status == "paid_out"
    end

    test "mutations are blocked once the distribution is not drafted", ctx do
      {:ok, dist_group} =
        Distributions.add_group(ctx.distribution, %{"employee_group_id" => ctx.group.id})

      {:ok, bonus} =
        Distributions.add_special_bonus(ctx.distribution, %{
          "employee_id" => ctx.e1.id,
          "amount" => "500"
        })

      {:ok, finalized} = Distributions.finalize_distribution(ctx.distribution)

      assert {:error, :not_drafted} =
               Distributions.update_distribution(finalized, %{"name" => "New name"})

      assert {:error, :not_drafted} = Distributions.delete_distribution(finalized)

      assert {:error, :not_drafted} =
               Distributions.add_group(finalized, %{"employee_group_id" => ctx.group.id})

      dist_group = Distributions.get_distribution_group!(dist_group.id)

      assert {:error, :not_drafted} =
               Distributions.update_distribution_group(dist_group, %{"allocation_pct" => "10"})

      assert {:error, :not_drafted} = Distributions.delete_distribution_group(dist_group)

      member = Distributions.get_member!(hd(dist_group.members).id)
      assert {:error, :not_drafted} = Distributions.update_member(member, %{"hours" => "10"})

      assert {:error, :not_drafted} =
               Distributions.add_special_bonus(finalized, %{
                 "employee_id" => ctx.e1.id,
                 "amount" => "1"
               })

      bonus = Distributions.get_special_bonus!(bonus.id)
      assert {:error, :not_drafted} = Distributions.delete_special_bonus(bonus)
    end
  end

  describe "weight validation" do
    test "effort_weight + impact_weight must equal 100" do
      assert {:error, changeset} =
               Distributions.create_distribution(%{
                 "name" => "Bad",
                 "effort_weight" => 30,
                 "impact_weight" => 30
               })

      assert %{effort_weight: [_ | _]} = errors_on(changeset)

      assert {:error, changeset} =
               Distribution.changeset(%Distribution{}, %{
                 name: "Bad",
                 effort_weight: 60,
                 impact_weight: 60
               })
               |> Repo.insert()

      assert %{effort_weight: [_ | _]} = errors_on(changeset)

      assert {:ok, _} =
               Distributions.create_distribution(%{
                 "name" => "Good",
                 "effort_weight" => 70,
                 "impact_weight" => 30
               })
    end
  end
end
