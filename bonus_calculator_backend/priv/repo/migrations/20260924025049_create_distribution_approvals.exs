defmodule BonusCalculatorBackend.Repo.Migrations.CreateDistributionApprovals do
  use Ecto.Migration

  def change do
    create table(:distribution_approvals, primary_key: false) do
      add :id, :binary_id, primary_key: true

      add :distribution_id,
          references(:distributions, type: :binary_id, on_delete: :delete_all),
          null: false

      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false

      add :selfie, :text, null: false
      add :approved_at, :utc_datetime, null: false

      timestamps(type: :utc_datetime)
    end

    create unique_index(:distribution_approvals, [:distribution_id, :user_id])
  end
end
