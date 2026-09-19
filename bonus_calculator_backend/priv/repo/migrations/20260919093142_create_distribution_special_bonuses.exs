defmodule BonusCalculatorBackend.Repo.Migrations.CreateDistributionSpecialBonuses do
  use Ecto.Migration

  def change do
    create table(:distribution_special_bonuses, primary_key: false) do
      add :id, :binary_id, primary_key: true

      add :distribution_id,
          references(:distributions, type: :binary_id, on_delete: :delete_all),
          null: false

      add :employee_id, references(:employees, type: :binary_id, on_delete: :delete_all),
        null: false

      add :amount, :decimal, null: false
      add :note, :string

      timestamps(type: :utc_datetime)
    end

    create index(:distribution_special_bonuses, [:distribution_id])
  end
end
