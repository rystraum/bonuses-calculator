defmodule BonusCalculatorBackend.Distributions.DistributionGroup do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  schema "distribution_groups" do
    field :name, :string
    field :allocation_pct, :decimal, default: Decimal.new(0)
    field :impact_weight, :integer
    field :effort_weight, :integer

    belongs_to :distribution, BonusCalculatorBackend.Distributions.Distribution
    belongs_to :employee_group, BonusCalculatorBackend.Groups.EmployeeGroup

    has_many :members, BonusCalculatorBackend.Distributions.DistributionGroupMember

    timestamps(type: :utc_datetime)
  end

  def create_changeset(distribution_group, attrs) do
    distribution_group
    |> cast(attrs, [
      :distribution_id,
      :employee_group_id,
      :name,
      :allocation_pct,
      :impact_weight,
      :effort_weight
    ])
    |> validate_required([:distribution_id, :name])
    |> validate_number(:allocation_pct, greater_than_or_equal_to: 0, less_than_or_equal_to: 100)
    |> validate_weights_sum()
    |> foreign_key_constraint(:distribution_id)
    |> foreign_key_constraint(:employee_group_id)
  end

  def update_changeset(distribution_group, attrs) do
    distribution_group
    |> cast(attrs, [:allocation_pct, :impact_weight, :effort_weight])
    |> validate_number(:allocation_pct, greater_than_or_equal_to: 0, less_than_or_equal_to: 100)
    |> validate_weights_sum()
  end

  # Per-group weight overrides apply only when BOTH are set; in that case they
  # must sum to 100 like the distribution-level weights.
  defp validate_weights_sum(changeset) do
    effort = get_field(changeset, :effort_weight)
    impact = get_field(changeset, :impact_weight)

    if is_integer(effort) and is_integer(impact) and effort + impact != 100 do
      add_error(changeset, :effort_weight, "effort_weight and impact_weight must add up to 100")
    else
      changeset
    end
  end
end
