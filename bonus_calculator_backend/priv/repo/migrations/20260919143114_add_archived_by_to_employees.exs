defmodule BonusCalculatorBackend.Repo.Migrations.AddArchivedByToEmployees do
  use Ecto.Migration

  def change do
    alter table(:employees) do
      add :archived_by_id, references(:users, type: :binary_id, on_delete: :nilify_all)
    end

    create index(:employees, [:archived_by_id])
  end
end
