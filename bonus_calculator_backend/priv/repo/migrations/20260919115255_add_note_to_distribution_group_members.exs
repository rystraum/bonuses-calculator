defmodule BonusCalculatorBackend.Repo.Migrations.AddNoteToDistributionGroupMembers do
  use Ecto.Migration

  def change do
    alter table(:distribution_group_members) do
      add :note, :text
    end
  end
end
