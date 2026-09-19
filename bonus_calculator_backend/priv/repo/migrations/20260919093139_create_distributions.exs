defmodule BonusCalculatorBackend.Repo.Migrations.CreateDistributions do
  use Ecto.Migration

  def change do
    create table(:distributions, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :name, :string, null: false
      add :description, :text
      add :include_shareholders, :boolean, null: false, default: false
      add :status, :string, null: false, default: "drafted"
      add :dividends_budget, :decimal, null: false, default: 0
      add :bonus_budget, :decimal, null: false, default: 0
      add :effort_weight, :integer, null: false, default: 50
      add :impact_weight, :integer, null: false, default: 50
      add :rounding_step, :integer, null: false, default: 10

      timestamps(type: :utc_datetime)
    end
  end
end
