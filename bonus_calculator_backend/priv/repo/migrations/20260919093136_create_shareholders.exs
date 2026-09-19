defmodule BonusCalculatorBackend.Repo.Migrations.CreateShareholders do
  use Ecto.Migration

  def change do
    create table(:shareholders, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :name, :string, null: false
      add :shares, :integer, null: false
      add :employee_id, references(:employees, type: :binary_id, on_delete: :nilify_all)

      timestamps(type: :utc_datetime)
    end

    create index(:shareholders, [:employee_id])
  end
end
