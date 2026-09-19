defmodule BonusCalculatorBackend.Repo.Migrations.AddWeightOverridesToDistributionGroups do
  use Ecto.Migration

  def change do
    alter table(:distribution_groups) do
      add :impact_weight, :integer
      add :effort_weight, :integer
    end
  end
end
