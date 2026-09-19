defmodule BonusCalculatorBackend.Repo.Migrations.CreateDistributionShareholders do
  use Ecto.Migration

  def change do
    create table(:distribution_shareholders, primary_key: false) do
      add :id, :binary_id, primary_key: true

      add :distribution_id,
          references(:distributions, type: :binary_id, on_delete: :delete_all),
          null: false

      add :shareholder_id, references(:shareholders, type: :binary_id, on_delete: :nilify_all)

      add :name, :string, null: false
      add :shares, :integer, null: false

      timestamps(type: :utc_datetime)
    end

    create index(:distribution_shareholders, [:distribution_id])
    create index(:distribution_shareholders, [:shareholder_id])
  end
end
