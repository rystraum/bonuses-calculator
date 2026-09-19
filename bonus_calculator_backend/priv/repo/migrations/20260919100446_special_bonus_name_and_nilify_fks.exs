defmodule BonusCalculatorBackend.Repo.Migrations.SpecialBonusNameAndNilifyFks do
  use Ecto.Migration

  def up do
    alter table(:distribution_special_bonuses) do
      add :name, :string
    end

    # Snapshot rows (distribution group members, special bonuses) must survive
    # the deletion of the linked employee — their names are snapshotted.
    for table <- [:distribution_special_bonuses, :distribution_group_members] do
      drop constraint(table, "#{table}_employee_id_fkey")

      alter table(table) do
        modify :employee_id, references(:employees, type: :binary_id, on_delete: :nilify_all),
          null: true
      end
    end
  end

  def down do
    execute "DELETE FROM distribution_special_bonuses WHERE employee_id IS NULL"
    execute "DELETE FROM distribution_group_members WHERE employee_id IS NULL"

    for table <- [:distribution_special_bonuses, :distribution_group_members] do
      drop constraint(table, "#{table}_employee_id_fkey")

      alter table(table) do
        modify :employee_id, references(:employees, type: :binary_id, on_delete: :delete_all),
          null: false
      end
    end

    alter table(:distribution_special_bonuses) do
      remove :name
    end
  end
end
