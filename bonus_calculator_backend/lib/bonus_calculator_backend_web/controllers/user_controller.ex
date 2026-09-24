defmodule BonusCalculatorBackendWeb.UserController do
  use BonusCalculatorBackendWeb, :controller

  alias BonusCalculatorBackend.Accounts

  action_fallback BonusCalculatorBackendWeb.FallbackController

  def update(conn, params) do
    conn.assigns.current_user
    |> Accounts.update_user(Map.take(params, ["username", "password"]))
    |> case do
      {:ok, user} ->
        json(conn, %{data: %{user: %{id: user.id, username: user.username}}})

      {:error, changeset} ->
        {:error, changeset}
    end
  end
end
