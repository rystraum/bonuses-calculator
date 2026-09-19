defmodule BonusCalculatorBackend.Distributions.Distribution do
  use Ecto.Schema
  import Ecto.Changeset

  @statuses ~w(drafted finalized paid_out)

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  schema "distributions" do
    field :name, :string
    field :description, :string
    field :include_shareholders, :boolean, default: false
    field :status, :string, default: "drafted"
    field :dividends_budget, :decimal, default: Decimal.new(0)
    field :bonus_budget, :decimal, default: Decimal.new(0)
    field :effort_weight, :integer, default: 50
    field :impact_weight, :integer, default: 50
    field :rounding_step, :integer, default: 10
    field :planned_date, :date
    field :finalized_at, :utc_datetime
    field :paid_out_at, :utc_datetime

    belongs_to :created_by, BonusCalculatorBackend.Accounts.User
    belongs_to :finalized_by, BonusCalculatorBackend.Accounts.User
    belongs_to :paid_out_by, BonusCalculatorBackend.Accounts.User

    has_many :distribution_groups, BonusCalculatorBackend.Distributions.DistributionGroup
    has_many :special_bonuses, BonusCalculatorBackend.Distributions.DistributionSpecialBonus

    has_many :distribution_shareholders,
             BonusCalculatorBackend.Distributions.DistributionShareholder

    timestamps(type: :utc_datetime)
  end

  def statuses, do: @statuses

  def changeset(distribution, attrs) do
    distribution
    |> cast(attrs, [
      :name,
      :description,
      :include_shareholders,
      :dividends_budget,
      :bonus_budget,
      :effort_weight,
      :impact_weight,
      :rounding_step,
      :planned_date
    ])
    |> validate_required([:name])
    |> validate_number(:effort_weight, greater_than_or_equal_to: 0, less_than_or_equal_to: 100)
    |> validate_number(:impact_weight, greater_than_or_equal_to: 0, less_than_or_equal_to: 100)
    |> validate_number(:rounding_step, greater_than: 0)
    |> validate_weights_sum()
  end

  def status_changeset(distribution, status, attrs \\ %{}) do
    distribution
    |> cast(attrs, [:finalized_by_id, :finalized_at, :paid_out_by_id, :paid_out_at])
    |> put_change(:status, status)
    |> validate_inclusion(:status, @statuses)
  end

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
