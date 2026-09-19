defmodule BonusCalculatorBackend.Groups.EmployeeGroup do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  schema "employee_groups" do
    field :name, :string

    has_many :memberships, BonusCalculatorBackend.Groups.EmployeeGroupMembership

    many_to_many :employees, BonusCalculatorBackend.People.Employee,
      join_through: BonusCalculatorBackend.Groups.EmployeeGroupMembership

    timestamps(type: :utc_datetime)
  end

  def changeset(employee_group, attrs) do
    employee_group
    |> cast(attrs, [:name])
    |> validate_required([:name])
  end
end
