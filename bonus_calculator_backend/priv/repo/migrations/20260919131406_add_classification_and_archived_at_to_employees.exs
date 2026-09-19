defmodule BonusCalculatorBackend.Repo.Migrations.AddClassificationAndArchivedAtToEmployees do
  use Ecto.Migration

  def change do
    alter table(:employees) do
      add :classification, :string
      add :archived_at, :utc_datetime
    end
  end
end
