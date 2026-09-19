defmodule BonusCalculatorBackend.Repo.Migrations.AddPlannedDateToDistributions do
  use Ecto.Migration

  def change do
    alter table(:distributions) do
      add :planned_date, :date
    end
  end
end
