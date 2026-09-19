defmodule BonusCalculatorBackend.Distributions.DistributionShareholder do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  schema "distribution_shareholders" do
    field :name, :string
    field :shares, :integer

    belongs_to :distribution, BonusCalculatorBackend.Distributions.Distribution
    belongs_to :shareholder, BonusCalculatorBackend.People.Shareholder

    timestamps(type: :utc_datetime)
  end

  def changeset(distribution_shareholder, attrs) do
    distribution_shareholder
    |> cast(attrs, [:distribution_id, :shareholder_id, :name, :shares])
    |> validate_required([:distribution_id, :name, :shares])
    |> validate_number(:shares, greater_than_or_equal_to: 0)
    |> foreign_key_constraint(:distribution_id)
    |> foreign_key_constraint(:shareholder_id)
  end
end
