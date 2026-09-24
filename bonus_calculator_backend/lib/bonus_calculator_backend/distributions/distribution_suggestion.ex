defmodule BonusCalculatorBackend.Distributions.DistributionSuggestion do
  @moduledoc """
  A non-owner's proposed edit set on a drafted distribution: an explanation plus
  a `changes` map overlaying distribution fields, group fields, member fields,
  and appended special bonuses. One set per user per distribution.
  """

  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  schema "distribution_suggestions" do
    field :explanation, :string
    field :changes, :map

    belongs_to :distribution, BonusCalculatorBackend.Distributions.Distribution
    belongs_to :user, BonusCalculatorBackend.Accounts.User

    timestamps(type: :utc_datetime)
  end

  def changeset(suggestion, attrs) do
    suggestion
    |> cast(attrs, [:explanation, :changes])
    |> validate_required([:explanation, :changes])
    |> foreign_key_constraint(:distribution_id)
    |> foreign_key_constraint(:user_id)
    |> unique_constraint([:distribution_id, :user_id])
  end
end
