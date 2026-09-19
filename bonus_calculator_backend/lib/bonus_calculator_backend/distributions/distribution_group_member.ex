defmodule BonusCalculatorBackend.Distributions.DistributionGroupMember do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  schema "distribution_group_members" do
    field :employee_name, :string
    field :hours, :decimal, default: Decimal.new(0)
    field :performance_multiplier, :decimal, default: Decimal.new(100)
    field :note, :string

    belongs_to :distribution_group, BonusCalculatorBackend.Distributions.DistributionGroup
    belongs_to :employee, BonusCalculatorBackend.People.Employee

    timestamps(type: :utc_datetime)
  end

  def create_changeset(member, attrs) do
    member
    |> cast(attrs, [
      :distribution_group_id,
      :employee_id,
      :employee_name,
      :hours,
      :performance_multiplier,
      :note
    ])
    |> validate_required([:distribution_group_id, :employee_id, :employee_name])
    |> foreign_key_constraint(:distribution_group_id)
    |> foreign_key_constraint(:employee_id)
  end

  def update_changeset(member, attrs) do
    member
    |> cast(attrs, [:hours, :performance_multiplier, :note])
    |> validate_number(:hours, greater_than_or_equal_to: 0)
    |> validate_number(:performance_multiplier, greater_than_or_equal_to: 0)
  end
end
