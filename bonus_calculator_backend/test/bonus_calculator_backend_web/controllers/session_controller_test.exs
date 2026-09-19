defmodule BonusCalculatorBackendWeb.SessionControllerTest do
  use BonusCalculatorBackendWeb.ConnCase, async: true

  alias BonusCalculatorBackend.Accounts

  setup do
    {:ok, user} = Accounts.create_user(%{"username" => "admin", "password" => "admin123"})
    {:ok, token} = Accounts.create_api_token(user)
    %{user: user, token: token.token}
  end

  defp authed_conn(conn, token) do
    conn
    |> put_req_header("authorization", "Bearer #{token}")
    |> put_req_header("accept", "application/json")
  end

  test "POST /api/session with valid credentials returns a token", %{conn: conn, user: user} do
    conn = post(conn, ~p"/api/session", %{username: "admin", password: "admin123"})

    assert %{"data" => %{"token" => token, "user" => %{"id" => id, "username" => "admin"}}} =
             json_response(conn, 200)

    assert is_binary(token)
    assert id == user.id
  end

  test "POST /api/session with bad credentials returns 401", %{conn: conn} do
    conn = post(conn, ~p"/api/session", %{username: "admin", password: "wrong"})
    assert %{"error" => "invalid credentials"} = json_response(conn, 401)

    conn = post(conn, ~p"/api/session", %{username: "nobody", password: "admin123"})
    assert %{"error" => "invalid credentials"} = json_response(conn, 401)
  end

  test "requests without a token get 401", %{conn: conn} do
    conn = get(conn, ~p"/api/employees")
    assert %{"error" => "unauthorized"} = json_response(conn, 401)
  end

  test "authed request succeeds; DELETE /api/session revokes the token", %{
    conn: conn,
    token: token
  } do
    conn = conn |> authed_conn(token) |> get(~p"/api/employees")
    assert %{"data" => []} = json_response(conn, 200)

    conn = build_conn() |> authed_conn(token) |> delete(~p"/api/session")
    assert json_response(conn, 200)

    assert Accounts.get_user_by_token(token) == nil

    conn = build_conn() |> authed_conn(token) |> get(~p"/api/employees")
    assert %{"error" => "unauthorized"} = json_response(conn, 401)
  end

  test "mutation of a finalized distribution returns 422 via API", %{conn: conn, token: token} do
    alias BonusCalculatorBackend.Distributions

    {:ok, distribution} = Distributions.create_distribution(%{"name" => "Q1"})
    {:ok, _} = Distributions.finalize_distribution(distribution)

    conn =
      conn
      |> authed_conn(token)
      |> patch(~p"/api/distributions/#{distribution.id}", %{name: "Renamed"})

    assert %{"error" => "distribution is not drafted"} = json_response(conn, 422)
  end
end
