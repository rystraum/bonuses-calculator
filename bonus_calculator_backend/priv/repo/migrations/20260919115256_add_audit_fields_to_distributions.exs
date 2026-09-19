defmodule BonusCalculatorBackend.Repo.Migrations.AddAuditFieldsToDistributions do
  use Ecto.Migration

  def change do
    alter table(:distributions) do
      add :created_by_id, references(:users, type: :binary_id, on_delete: :nilify_all)
      add :finalized_by_id, references(:users, type: :binary_id, on_delete: :nilify_all)
      add :paid_out_by_id, references(:users, type: :binary_id, on_delete: :nilify_all)
      add :finalized_at, :utc_datetime
      add :paid_out_at, :utc_datetime
    end
  end
end
