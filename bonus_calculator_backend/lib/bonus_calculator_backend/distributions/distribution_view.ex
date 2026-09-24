defmodule BonusCalculatorBackend.Distributions.DistributionView do
  @moduledoc """
  Records that a user has seen a distribution, stamping the latest `seen_at`.
  One row per user per distribution. All fields are set programmatically.
  """

  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  schema "distribution_views" do
    field :seen_at, :utc_datetime

    belongs_to :distribution, BonusCalculatorBackend.Distributions.Distribution
    belongs_to :user, BonusCalculatorBackend.Accounts.User

    timestamps(type: :utc_datetime)
  end

  def changeset(view, attrs) do
    view
    |> cast(attrs, [])
    |> foreign_key_constraint(:distribution_id)
    |> foreign_key_constraint(:user_id)
    |> unique_constraint([:distribution_id, :user_id])
  end
end
