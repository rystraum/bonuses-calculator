defmodule BonusCalculatorBackend.Repo.Migrations.CreateDistributionGroupMembers do
  use Ecto.Migration

  def change do
    create table(:distribution_group_members, primary_key: false) do
      add :id, :binary_id, primary_key: true

      add :distribution_group_id,
          references(:distribution_groups, type: :binary_id, on_delete: :delete_all),
          null: false

      add :employee_id, references(:employees, type: :binary_id, on_delete: :delete_all),
        null: false

      add :employee_name, :string, null: false
      add :hours, :decimal, null: false, default: 0
      add :performance_multiplier, :decimal, null: false, default: 100

      timestamps(type: :utc_datetime)
    end

    create index(:distribution_group_members, [:distribution_group_id])
  end
end
