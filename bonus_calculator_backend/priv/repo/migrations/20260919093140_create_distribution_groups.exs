defmodule BonusCalculatorBackend.Repo.Migrations.CreateDistributionGroups do
  use Ecto.Migration

  def change do
    create table(:distribution_groups, primary_key: false) do
      add :id, :binary_id, primary_key: true

      add :distribution_id,
          references(:distributions, type: :binary_id, on_delete: :delete_all),
          null: false

      add :employee_group_id,
          references(:employee_groups, type: :binary_id, on_delete: :nilify_all)

      add :name, :string, null: false
      add :allocation_pct, :decimal, null: false, default: 0

      timestamps(type: :utc_datetime)
    end

    create index(:distribution_groups, [:distribution_id])
  end
end
