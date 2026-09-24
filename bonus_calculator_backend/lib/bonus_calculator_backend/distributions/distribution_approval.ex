defmodule BonusCalculatorBackend.Distributions.DistributionApproval do
  @moduledoc """
  A non-owner's approval of a drafted distribution, recording the approval
  timestamp and a mandatory selfie (a data URL, e.g. "data:image/jpeg;base64,...").
  One approval per user per distribution.
  """

  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  schema "distribution_approvals" do
    field :selfie, :string
    field :approved_at, :utc_datetime

    belongs_to :distribution, BonusCalculatorBackend.Distributions.Distribution
    belongs_to :user, BonusCalculatorBackend.Accounts.User

    timestamps(type: :utc_datetime)
  end

  def changeset(approval, attrs) do
    approval
    |> cast(attrs, [:selfie])
    |> validate_required([:selfie])
    |> validate_length(:selfie, min: 1)
    |> foreign_key_constraint(:distribution_id)
    |> foreign_key_constraint(:user_id)
    |> unique_constraint([:distribution_id, :user_id])
  end
end
