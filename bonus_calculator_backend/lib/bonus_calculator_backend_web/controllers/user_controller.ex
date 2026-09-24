defmodule BonusCalculatorBackendWeb.UserController do
  use BonusCalculatorBackendWeb, :controller

  alias BonusCalculatorBackend.Accounts

  action_fallback BonusCalculatorBackendWeb.FallbackController

  def index(conn, _params) do
    json(conn, %{data: Enum.map(Accounts.list_users(), &user_json/1)})
  end

  def create(conn, params) do
    with {:ok, user} <- Accounts.create_user(Map.take(params, ["username", "password"])) do
      conn
      |> put_status(:created)
      |> json(%{data: %{user: user_json(user)}})
    end
  end

  def update(conn, params) do
    conn.assigns.current_user
    |> Accounts.update_user(Map.take(params, ["username", "password"]))
    |> case do
      {:ok, user} ->
        json(conn, %{data: %{user: user_json(user)}})

      {:error, changeset} ->
        {:error, changeset}
    end
  end

  defp user_json(user), do: %{id: user.id, username: user.username}
end
