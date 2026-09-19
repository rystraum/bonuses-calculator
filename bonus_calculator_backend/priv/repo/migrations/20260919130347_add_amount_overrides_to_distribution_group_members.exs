defmodule BonusCalculatorBackend.Repo.Migrations.AddAmountOverridesToDistributionGroupMembers do
  use Ecto.Migration

  def change do
    alter table(:distribution_group_members) do
      add :impact_amount, :decimal
      add :effort_amount, :decimal
    end
  end
end
