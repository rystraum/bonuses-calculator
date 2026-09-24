defmodule BonusCalculatorBackend.Accounts.User do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  schema "users" do
    field :username, :string
    field :password, :string, virtual: true, redact: true
    field :password_hash, :string, redact: true

    has_many :api_tokens, BonusCalculatorBackend.Accounts.ApiToken

    timestamps(type: :utc_datetime)
  end

  def changeset(user, attrs) do
    user
    |> cast(attrs, [:username, :password])
    |> validate_required([:username, :password])
    |> validate_length(:username, min: 1)
    |> unique_constraint(:username)
    |> hash_password()
  end

  @doc """
  Changeset for account self-service: username is required (kept from data
  when not being changed), password is optional and hashed when present.
  """
  def settings_changeset(user, attrs) do
    user
    |> cast(attrs, [:username, :password])
    |> validate_required([:username])
    |> validate_changed_username()
    |> validate_length(:password, min: 6)
    |> unique_constraint(:username)
    |> hash_password()
  end

  defp validate_changed_username(changeset) do
    if get_change(changeset, :username) do
      validate_format(changeset, :username, ~r/^[^@\s]+@[^@\s]+$/,
        message: "must be a valid email address"
      )
    else
      changeset
    end
  end

  defp hash_password(changeset) do
    case get_change(changeset, :password) do
      nil -> changeset
      password -> put_change(changeset, :password_hash, Bcrypt.hash_pwd_salt(password))
    end
  end
end
