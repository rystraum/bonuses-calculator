defmodule BonusCalculatorBackend.Accounts.ApiToken do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  schema "api_tokens" do
    field :token, :string

    belongs_to :user, BonusCalculatorBackend.Accounts.User

    timestamps(type: :utc_datetime)
  end

  def changeset(api_token, attrs) do
    api_token
    |> cast(attrs, [:token, :user_id])
    |> validate_required([:token, :user_id])
    |> unique_constraint(:token)
    |> foreign_key_constraint(:user_id)
  end
end
