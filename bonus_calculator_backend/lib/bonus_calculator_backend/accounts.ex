defmodule BonusCalculatorBackend.Accounts do
  @moduledoc """
  User accounts and token-based API authentication.
  """

  import Ecto.Query, warn: false

  alias BonusCalculatorBackend.Accounts.{ApiToken, User}
  alias BonusCalculatorBackend.Repo

  def create_user(attrs) do
    %User{}
    |> User.changeset(attrs)
    |> Repo.insert()
  end

  def update_user(%User{} = user, attrs) do
    user
    |> User.settings_changeset(attrs)
    |> Repo.update()
  end

  def get_user_by_username(username) do
    Repo.get_by(User, username: username)
  end

  def authenticate(username, password) do
    user = get_user_by_username(username)

    cond do
      user && Bcrypt.verify_pass(password, user.password_hash) ->
        {:ok, user}

      user ->
        :error

      true ->
        Bcrypt.no_user_verify()
        :error
    end
  end

  def create_api_token(%User{} = user) do
    token = :crypto.strong_rand_bytes(32) |> Base.url_encode64(padding: false)

    %ApiToken{}
    |> ApiToken.changeset(%{token: token, user_id: user.id})
    |> Repo.insert()
  end

  def get_user_by_token(token) when is_binary(token) do
    ApiToken
    |> where([t], t.token == ^token)
    |> preload(:user)
    |> Repo.one()
    |> case do
      nil -> nil
      %ApiToken{user: user} -> user
    end
  end

  def delete_api_token(token) when is_binary(token) do
    Repo.delete_all(from t in ApiToken, where: t.token == ^token)
  end
end
