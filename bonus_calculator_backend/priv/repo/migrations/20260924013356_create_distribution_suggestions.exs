defmodule BonusCalculatorBackend.Repo.Migrations.CreateDistributionSuggestions do
  use Ecto.Migration

  def change do
    create table(:distribution_suggestions, primary_key: false) do
      add :id, :binary_id, primary_key: true

      add :distribution_id,
          references(:distributions, type: :binary_id, on_delete: :delete_all),
          null: false

      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false

      add :explanation, :text, null: false
      add :changes, :map, null: false, default: %{}

      timestamps(type: :utc_datetime)
    end

    create unique_index(:distribution_suggestions, [:distribution_id, :user_id])
  end
end
