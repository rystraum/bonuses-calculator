defmodule BonusCalculatorBackendWeb.Plugs.Authenticate do
  @moduledoc """
  Reads `Authorization: Bearer <token>`, loads the user, and halts with
  401 `%{error: "unauthorized"}` otherwise.
  """

  import Plug.Conn

  alias BonusCalculatorBackend.Accounts

  def init(opts), do: opts

  def call(conn, _opts) do
    with ["Bearer " <> token] <- get_req_header(conn, "authorization"),
         user when not is_nil(user) <- Accounts.get_user_by_token(token) do
      conn
      |> assign(:current_user, user)
      |> assign(:current_token, token)
    else
      _ ->
        conn
        |> put_status(:unauthorized)
        |> Phoenix.Controller.json(%{error: "unauthorized"})
        |> halt()
    end
  end
end
