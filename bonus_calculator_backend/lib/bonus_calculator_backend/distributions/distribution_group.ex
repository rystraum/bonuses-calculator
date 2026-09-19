defmodule BonusCalculatorBackend.Distributions.DistributionGroup do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  schema "distribution_groups" do
    field :name, :string
    field :allocation_pct, :decimal, default: Decimal.new(0)

    belongs_to :distribution, BonusCalculatorBackend.Distributions.Distribution
    belongs_to :employee_group, BonusCalculatorBackend.Groups.EmployeeGroup

    has_many :members, BonusCalculatorBackend.Distributions.DistributionGroupMember

    timestamps(type: :utc_datetime)
  end

  def create_changeset(distribution_group, attrs) do
    distribution_group
    |> cast(attrs, [:distribution_id, :employee_group_id, :name, :allocation_pct])
    |> validate_required([:distribution_id, :name])
    |> validate_number(:allocation_pct, greater_than_or_equal_to: 0, less_than_or_equal_to: 100)
    |> foreign_key_constraint(:distribution_id)
    |> foreign_key_constraint(:employee_group_id)
  end

  def update_changeset(distribution_group, attrs) do
    distribution_group
    |> cast(attrs, [:allocation_pct])
    |> validate_number(:allocation_pct, greater_than_or_equal_to: 0, less_than_or_equal_to: 100)
  end
end
