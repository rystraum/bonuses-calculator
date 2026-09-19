defmodule BonusCalculatorBackend.Distributions.DistributionSpecialBonus do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  schema "distribution_special_bonuses" do
    field :amount, :decimal
    field :note, :string
    field :name, :string

    belongs_to :distribution, BonusCalculatorBackend.Distributions.Distribution
    belongs_to :employee, BonusCalculatorBackend.People.Employee

    timestamps(type: :utc_datetime)
  end

  def changeset(special_bonus, attrs) do
    special_bonus
    |> cast(attrs, [:distribution_id, :employee_id, :amount, :note, :name])
    |> validate_required([:distribution_id, :amount])
    |> validate_employee_or_name()
    |> validate_number(:amount, greater_than_or_equal_to: 0)
    |> foreign_key_constraint(:distribution_id)
    |> foreign_key_constraint(:employee_id)
  end

  # A special bonus is either attached to an employee or carries a free-text
  # name (e.g. a contractor outside the employee roster).
  defp validate_employee_or_name(changeset) do
    employee_id = get_field(changeset, :employee_id)
    name = get_field(changeset, :name)

    if employee_id || (is_binary(name) && String.trim(name) != "") do
      changeset
    else
      add_error(changeset, :employee_id, "or name must be present")
    end
  end
end
