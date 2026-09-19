defmodule BonusCalculatorBackend.Groups.EmployeeGroupMembership do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  schema "employee_group_memberships" do
    belongs_to :employee, BonusCalculatorBackend.People.Employee
    belongs_to :employee_group, BonusCalculatorBackend.Groups.EmployeeGroup

    timestamps(type: :utc_datetime)
  end

  def changeset(membership, attrs) do
    membership
    |> cast(attrs, [:employee_id, :employee_group_id])
    |> validate_required([:employee_id, :employee_group_id])
    |> foreign_key_constraint(:employee_id)
    |> foreign_key_constraint(:employee_group_id)
    |> unique_constraint([:employee_id, :employee_group_id],
      name: :employee_group_memberships_employee_group_unique_index
    )
  end
end
