defmodule BonusCalculatorBackend.Repo.Migrations.CreateEmployeeGroupMemberships do
  use Ecto.Migration

  def change do
    create table(:employee_group_memberships, primary_key: false) do
      add :id, :binary_id, primary_key: true

      add :employee_id, references(:employees, type: :binary_id, on_delete: :delete_all),
        null: false

      add :employee_group_id,
          references(:employee_groups, type: :binary_id, on_delete: :delete_all),
          null: false

      timestamps(type: :utc_datetime)
    end

    create unique_index(:employee_group_memberships, [:employee_id, :employee_group_id],
             name: :employee_group_memberships_employee_group_unique_index
           )

    create index(:employee_group_memberships, [:employee_group_id])
  end
end
