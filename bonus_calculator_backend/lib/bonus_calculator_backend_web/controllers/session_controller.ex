defmodule BonusCalculatorBackendWeb.SessionController do
  use BonusCalculatorBackendWeb, :controller

  alias BonusCalculatorBackend.Accounts

  action_fallback BonusCalculatorBackendWeb.FallbackController

  def create(conn, %{"username" => username, "password" => password}) do
    case Accounts.authenticate(username, password) do
      {:ok, user} ->
        {:ok, api_token} = Accounts.create_api_token(user)

        conn
        |> put_status(:ok)
        |> json(%{
          data: %{
            token: api_token.token,
            user: %{id: user.id, username: user.username}
          }
        })

      :error ->
        conn
        |> put_status(:unauthorized)
        |> json(%{error: "invalid credentials"})
    end
  end

  def create(conn, _params) do
    conn
    |> put_status(:unauthorized)
    |> json(%{error: "invalid credentials"})
  end

  def delete(conn, _params) do
    Accounts.delete_api_token(conn.assigns.current_token)

    conn
    |> put_status(:ok)
    |> json(%{data: %{message: "logged out"}})
  end
end
