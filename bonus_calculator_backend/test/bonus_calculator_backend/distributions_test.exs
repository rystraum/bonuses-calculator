defmodule BonusCalculatorBackend.DistributionsTest do
  use BonusCalculatorBackend.DataCase, async: true

  alias BonusCalculatorBackend.{Accounts, Distributions, Groups, People}
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

  defp create_user(username) do
    {:ok, user} = Accounts.create_user(%{"username" => username, "password" => "secret123"})
    user
  end

  describe "planned_date" do
    test "create and update round-trip planned_date" do
      {:ok, dist} =
        Distributions.create_distribution(%{"name" => "Dated", "planned_date" => "2026-12-15"})

      assert dist.planned_date == ~D[2026-12-15]

      assert {:ok, dist} =
               Distributions.update_distribution(dist, %{"planned_date" => "2027-01-31"}, nil)

      assert dist.planned_date == ~D[2027-01-31]

      assert {:ok, dist} = Distributions.update_distribution(dist, %{"planned_date" => nil}, nil)
      assert dist.planned_date == nil
    end

    test "planned_date update is blocked after finalize", ctx do
      {:ok, finalized} = Distributions.finalize_distribution(ctx.distribution)

      assert {:error, :not_drafted} =
               Distributions.update_distribution(
                 finalized,
                 %{"planned_date" => "2026-12-15"},
                 nil
               )
    end
  end

  describe "snapshots" do
    test "adding a group snapshots the name and members", ctx do
      {:ok, dist_group} =
        Distributions.add_group(
          ctx.distribution,
          %{
            "employee_group_id" => ctx.group.id,
            "allocation_pct" => "25"
          },
          nil
        )

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
        Distributions.add_group(ctx.distribution, %{"employee_group_id" => ctx.group.id}, nil)

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
        Distributions.add_group(ctx.distribution, %{"employee_group_id" => ctx.group.id}, nil)

      {:ok, dist_b} =
        Distributions.add_group(ctx.distribution, %{"employee_group_id" => other_group.id}, nil)

      {:ok, _} =
        Distributions.delete_distribution_group(
          Distributions.get_distribution_group!(dist_a.id),
          nil
        )

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
        Distributions.add_group(ctx.distribution, %{"employee_group_id" => ctx.group.id}, nil)

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
      {:ok, _} = Distributions.update_member(member, %{"hours" => "10"}, nil)

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
        Distributions.add_group(ctx.distribution, %{"employee_group_id" => ctx.group.id}, nil)

      {:ok, bonus} =
        Distributions.add_special_bonus(
          ctx.distribution,
          %{
            "employee_id" => ctx.e1.id,
            "amount" => "500"
          },
          nil
        )

      {:ok, finalized} = Distributions.finalize_distribution(ctx.distribution)

      assert {:error, :not_drafted} =
               Distributions.update_distribution(finalized, %{"name" => "New name"}, nil)

      assert {:error, :not_drafted} = Distributions.delete_distribution(finalized, nil)

      assert {:error, :not_drafted} =
               Distributions.add_group(finalized, %{"employee_group_id" => ctx.group.id}, nil)

      dist_group = Distributions.get_distribution_group!(dist_group.id)

      assert {:error, :not_drafted} =
               Distributions.update_distribution_group(
                 dist_group,
                 %{"allocation_pct" => "10"},
                 nil
               )

      assert {:error, :not_drafted} = Distributions.delete_distribution_group(dist_group, nil)

      member = Distributions.get_member!(hd(dist_group.members).id)

      assert {:error, :not_drafted} = Distributions.update_member(member, %{"hours" => "10"}, nil)

      assert {:error, :not_drafted} =
               Distributions.add_special_bonus(
                 finalized,
                 %{
                   "employee_id" => ctx.e1.id,
                   "amount" => "1"
                 },
                 nil
               )

      bonus = Distributions.get_special_bonus!(bonus.id)
      assert {:error, :not_drafted} = Distributions.delete_special_bonus(bonus, nil)
    end
  end

  describe "ownership" do
    setup ctx do
      owner = create_user("owner")
      other = create_user("other")

      {:ok, distribution} =
        Distributions.create_distribution(
          %{"name" => "Owned draft", "bonus_budget" => "10000"},
          owner
        )

      {:ok, dist_group} =
        Distributions.add_group(
          distribution,
          %{"employee_group_id" => ctx.group.id, "allocation_pct" => "100"},
          owner
        )

      {:ok, bonus} =
        Distributions.add_special_bonus(
          distribution,
          %{"employee_id" => ctx.e1.id, "amount" => "500"},
          owner
        )

      %{
        owner: owner,
        other: other,
        owned: distribution,
        owned_group: dist_group,
        owned_bonus: bonus
      }
    end

    test "non-owner cannot mutate an owned draft", ctx do
      assert {:error, :not_owner} =
               Distributions.update_distribution(ctx.owned, %{"name" => "Nope"}, ctx.other)

      assert {:error, :not_owner} = Distributions.delete_distribution(ctx.owned, ctx.other)

      assert {:error, :not_owner} =
               Distributions.add_group(
                 ctx.owned,
                 %{"employee_group_id" => ctx.group.id},
                 ctx.other
               )

      dist_group = Distributions.get_distribution_group!(ctx.owned_group.id)

      assert {:error, :not_owner} =
               Distributions.update_distribution_group(
                 dist_group,
                 %{"allocation_pct" => "10"},
                 ctx.other
               )

      assert {:error, :not_owner} =
               Distributions.delete_distribution_group(dist_group, ctx.other)

      member = Distributions.get_member!(hd(dist_group.members).id)

      assert {:error, :not_owner} =
               Distributions.update_member(member, %{"hours" => "10"}, ctx.other)

      assert {:error, :not_owner} =
               Distributions.add_special_bonus(
                 ctx.owned,
                 %{"employee_id" => ctx.e1.id, "amount" => "1"},
                 ctx.other
               )

      bonus = Distributions.get_special_bonus!(ctx.owned_bonus.id)

      assert {:error, :not_owner} = Distributions.delete_special_bonus(bonus, ctx.other)

      assert {:error, :not_owner} = Distributions.finalize_distribution(ctx.owned, ctx.other)
    end

    test "owner can mutate their own draft", ctx do
      assert {:ok, updated} =
               Distributions.update_distribution(ctx.owned, %{"name" => "Mine"}, ctx.owner)

      assert updated.name == "Mine"

      assert {:ok, finalized} = Distributions.finalize_distribution(ctx.owned, ctx.owner)
      assert finalized.status == "finalized"
    end

    test "non-owner cannot mark an owned finalized distribution paid", ctx do
      {:ok, finalized} = Distributions.finalize_distribution(ctx.owned, ctx.owner)

      assert {:error, :not_owner} = Distributions.mark_paid_distribution(finalized, ctx.other)
      assert {:ok, paid} = Distributions.mark_paid_distribution(finalized, ctx.owner)
      assert paid.status == "paid_out"
    end

    test "legacy nil-owner distributions stay editable by anyone", ctx do
      assert {:ok, updated} =
               Distributions.update_distribution(
                 ctx.distribution,
                 %{"name" => "Renamed"},
                 ctx.other
               )

      assert updated.name == "Renamed"

      assert {:ok, finalized} = Distributions.finalize_distribution(ctx.distribution, ctx.other)
      assert finalized.status == "finalized"
    end
  end

  describe "suggestions" do
    setup ctx do
      owner = create_user("suggestion-owner")
      suggester = create_user("suggester")

      {:ok, distribution} =
        Distributions.create_distribution(
          %{
            "name" => "Suggestable",
            "bonus_budget" => "10000",
            "effort_weight" => 50,
            "impact_weight" => 50,
            "rounding_step" => 10
          },
          owner
        )

      {:ok, dist_group} =
        Distributions.add_group(
          distribution,
          %{"employee_group_id" => ctx.group.id, "allocation_pct" => "100"},
          owner
        )

      for member <- dist_group.members do
        {:ok, _} =
          Distributions.update_member(
            member,
            %{"hours" => "100", "performance_multiplier" => "100"},
            owner
          )
      end

      %{owner: owner, suggester: suggester, dist: distribution, dist_group: dist_group}
    end

    test "upsert creates then replaces the user's set", ctx do
      {:ok, first} =
        Distributions.upsert_suggestion(ctx.dist, ctx.suggester, %{
          "explanation" => "v1",
          "changes" => %{"distribution" => %{"bonus_budget" => "20000"}}
        })

      assert first.explanation == "v1"
      assert first.changes == %{"distribution" => %{"bonus_budget" => "20000"}}
      assert first.user.id == ctx.suggester.id

      {:ok, second} =
        Distributions.upsert_suggestion(ctx.dist, ctx.suggester, %{
          "explanation" => "v2",
          "changes" => %{"distribution" => %{"bonus_budget" => "30000"}}
        })

      assert second.id == first.id
      assert second.explanation == "v2"
      assert second.changes == %{"distribution" => %{"bonus_budget" => "30000"}}

      assert [suggestion] = Distributions.list_suggestions(ctx.dist)
      assert suggestion.id == first.id
    end

    test "the owner cannot suggest on their own distribution", ctx do
      assert {:error, :owner_cannot_suggest} =
               Distributions.upsert_suggestion(ctx.dist, ctx.owner, %{
                 "explanation" => "self",
                 "changes" => %{}
               })
    end

    test "suggestions require a drafted distribution", ctx do
      {:ok, finalized} = Distributions.finalize_distribution(ctx.dist, ctx.owner)

      assert {:error, :not_drafted} =
               Distributions.upsert_suggestion(finalized, ctx.suggester, %{
                 "explanation" => "too late",
                 "changes" => %{}
               })
    end

    test "only the author can delete a suggestion", ctx do
      {:ok, suggestion} =
        Distributions.upsert_suggestion(ctx.dist, ctx.suggester, %{
          "explanation" => "mine",
          "changes" => %{}
        })

      assert {:error, :not_owner} = Distributions.delete_suggestion(suggestion, ctx.owner)
      assert {:ok, _} = Distributions.delete_suggestion(suggestion, ctx.suggester)
      assert Distributions.list_suggestions(ctx.dist) == []
    end

    test "list_suggestions returns sets newest first", ctx do
      other = create_user("other-suggester")

      {:ok, first} =
        Distributions.upsert_suggestion(ctx.dist, ctx.suggester, %{
          "explanation" => "first",
          "changes" => %{}
        })

      {:ok, second} =
        Distributions.upsert_suggestion(ctx.dist, other, %{
          "explanation" => "second",
          "changes" => %{}
        })

      # inserted_at has second precision; backdate the first row so ordering is
      # deterministic.
      first
      |> Ecto.Changeset.change(inserted_at: ~U[2026-01-01 00:00:00Z])
      |> Repo.update!()

      assert [%{id: second_id}, %{id: first_id}] = Distributions.list_suggestions(ctx.dist)
      assert second_id == second.id
      assert first_id == first.id
    end

    test "simulate/2 overlays distribution and member changes on the computation", ctx do
      full = Distributions.get_distribution_full!(ctx.dist.id)
      base = Distributions.simulate(full, %{})

      [base_group] = base.groups
      assert base_group.group_budget == "10000"
      # 5,000 impact / 200 multiplier = 25; 5,000 effort / 200 hours = 25
      assert Enum.all?(base_group.members, &(&1.total == "5000"))

      member1 = hd(ctx.dist_group.members)

      changes = %{
        "distribution" => %{"bonus_budget" => "20000"},
        "members" => %{member1.id => %{"hours" => "50", "performance_multiplier" => "50"}}
      }

      [sim_group] = Distributions.simulate(full, changes).groups
      assert sim_group.group_budget == "20000"

      # 10,000 / 150 = 66.66..., floored to step 10 -> 60 per impact/hour
      members = Map.new(sim_group.members, &{&1.id, &1})
      assert members[member1.id].total == "6000"

      [member2] = ctx.dist_group.members -- [member1]
      assert members[member2.id].total == "12000"
    end

    test "simulate/2 keeps historical amount overrides when not targeted", ctx do
      overridden = Enum.find(ctx.dist_group.members, &(&1.employee_id == ctx.e1.id))
      computed = Enum.find(ctx.dist_group.members, &(&1.employee_id == ctx.e2.id))

      overridden
      |> Ecto.Changeset.change(
        impact_amount: Decimal.new("3333.33"),
        effort_amount: Decimal.new("3333.33")
      )
      |> Repo.update!()

      full = Distributions.get_distribution_full!(ctx.dist.id)

      changes = %{
        "distribution" => %{"bonus_budget" => "20000"},
        "members" => %{computed.id => %{"hours" => "200"}}
      }

      [sim_group] = Distributions.simulate(full, changes).groups
      members = Map.new(sim_group.members, &{&1.id, &1})

      # The overridden member keeps its sheet-exact amounts...
      assert members[overridden.id].impact_amount == "3333.33"
      assert members[overridden.id].effort_amount == "3333.33"

      # ...while the targeted member is recomputed: 10,000 / 200 = 50 exactly
      # per impact; 10,000 / 300 hours = 33.33..., floored to 30 per hour
      assert members[computed.id].impact_amount == "5000"
      assert members[computed.id].effort_amount == "6000"
    end

    test "simulate/2 appends suggested special bonuses", ctx do
      full = Distributions.get_distribution_full!(ctx.dist.id)

      changes = %{
        "special_bonuses" => [
          %{"employee_id" => ctx.e1.id, "amount" => "1500", "note" => "retention"},
          %{"employee_id" => nil, "name" => "Contractor", "amount" => "500"}
        ]
      }

      result = Distributions.simulate(full, changes)

      assert result.totals.special_bonuses_total == "2000"

      bonuses = Enum.sort_by(result.special_bonuses, &Decimal.new(&1.amount), Decimal)

      assert [
               %{employee_id: nil, employee_name: nil, name: "Contractor", amount: "500"},
               %{employee_id: e1_id, employee_name: "Alice", amount: "1500"}
             ] = Enum.map(bonuses, &Map.take(&1, [:employee_id, :employee_name, :name, :amount]))

      assert e1_id == ctx.e1.id
    end
  end

  describe "approvals" do
    setup do
      owner = create_user("approval-owner")
      approver = create_user("approver")

      {:ok, distribution} =
        Distributions.create_distribution(
          %{"name" => "Approvable", "bonus_budget" => "10000"},
          owner
        )

      %{owner: owner, approver: approver, dist: distribution}
    end

    test "approve records the selfie and timestamp", ctx do
      {:ok, approval} =
        Distributions.approve_distribution(ctx.dist, ctx.approver, "data:image/jpeg;base64,abc")

      assert approval.selfie == "data:image/jpeg;base64,abc"
      assert %DateTime{} = approval.approved_at
      assert approval.user.id == ctx.approver.id
      assert approval.distribution_id == ctx.dist.id
    end

    test "re-approving replaces the selfie and keeps the row id", ctx do
      {:ok, first} = Distributions.approve_distribution(ctx.dist, ctx.approver, "selfie-v1")
      {:ok, second} = Distributions.approve_distribution(ctx.dist, ctx.approver, "selfie-v2")

      assert second.id == first.id
      assert second.selfie == "selfie-v2"

      assert [approval] = Distributions.list_approvals(ctx.dist)
      assert approval.id == first.id
      assert approval.selfie == "selfie-v2"
    end

    test "approvals require a selfie", ctx do
      assert {:error, changeset} = Distributions.approve_distribution(ctx.dist, ctx.approver, nil)
      assert %{selfie: [_ | _]} = errors_on(changeset)

      assert {:error, changeset} = Distributions.approve_distribution(ctx.dist, ctx.approver, "")
      assert %{selfie: [_ | _]} = errors_on(changeset)
    end

    test "the owner cannot approve their own distribution", ctx do
      assert {:error, :owner_cannot_approve} =
               Distributions.approve_distribution(ctx.dist, ctx.owner, "selfie")
    end

    test "approvals require a drafted distribution", ctx do
      {:ok, finalized} = Distributions.finalize_distribution(ctx.dist, ctx.owner)

      assert {:error, :not_drafted} =
               Distributions.approve_distribution(finalized, ctx.approver, "selfie")
    end

    test "rescind deletes the caller's approval", ctx do
      {:ok, _} = Distributions.approve_distribution(ctx.dist, ctx.approver, "selfie")

      assert {:ok, _} = Distributions.rescind_approval(ctx.dist, ctx.approver)
      assert Distributions.list_approvals(ctx.dist) == []
    end

    test "rescinding without an approval errors", ctx do
      assert {:error, :no_approval} = Distributions.rescind_approval(ctx.dist, ctx.approver)
    end

    test "list_approvals returns approvals oldest first with users", ctx do
      other = create_user("other-approver")

      {:ok, first} = Distributions.approve_distribution(ctx.dist, ctx.approver, "selfie-1")
      {:ok, second} = Distributions.approve_distribution(ctx.dist, other, "selfie-2")

      # approved_at has second precision; backdate the first row so ordering is
      # deterministic.
      first
      |> Ecto.Changeset.change(approved_at: ~U[2026-01-01 00:00:00Z])
      |> Repo.update!()

      assert [%{id: first_id}, %{id: second_id}] = Distributions.list_approvals(ctx.dist)
      assert first_id == first.id
      assert second_id == second.id
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
