defmodule BonusCalculatorBackendWeb.UserControllerTest do
  use BonusCalculatorBackendWeb.ConnCase, async: true

  alias BonusCalculatorBackend.Accounts

  setup do
    {:ok, user} =
      Accounts.create_user(%{"username" => "admin@example.com", "password" => "admin123"})

    {:ok, token} = Accounts.create_api_token(user)
    %{user: user, token: token.token}
  end

  defp authed_conn(conn, token) do
    conn
    |> put_req_header("authorization", "Bearer #{token}")
    |> put_req_header("accept", "application/json")
  end

  test "PATCH /api/user changes the username", %{conn: conn, token: token, user: user} do
    conn =
      conn
      |> authed_conn(token)
      |> patch(~p"/api/user", %{username: "new@example.com"})

    assert %{"data" => %{"user" => %{"id" => id, "username" => "new@example.com"}}} =
             json_response(conn, 200)

    assert id == user.id
    assert Accounts.get_user_by_username("new@example.com").id == user.id
  end

  test "PATCH /api/user changes the password and old password no longer works", %{
    conn: conn,
    token: token,
    user: user
  } do
    conn = conn |> authed_conn(token) |> patch(~p"/api/user", %{password: "newpass456"})

    assert %{"data" => %{"user" => %{"username" => "admin@example.com"}}} =
             json_response(conn, 200)

    assert Accounts.authenticate("admin@example.com", "newpass456") ==
             {:ok, Accounts.get_user_by_username("admin@example.com")}

    assert Accounts.authenticate("admin@example.com", "admin123") == :error
    assert Accounts.get_user_by_token(token).id == user.id
  end

  test "PATCH /api/user rejects a short password", %{conn: conn, token: token} do
    conn = conn |> authed_conn(token) |> patch(~p"/api/user", %{password: "123"})

    assert %{"errors" => %{"password" => [_ | _]}} = json_response(conn, 422)
  end

  test "PATCH /api/user rejects a non-email username", %{conn: conn, token: token} do
    conn = conn |> authed_conn(token) |> patch(~p"/api/user", %{username: "not-an-email"})

    assert %{"errors" => %{"username" => [_ | _]}} = json_response(conn, 422)
  end

  test "PATCH /api/user rejects a duplicate username", %{conn: conn, token: token} do
    {:ok, _other} =
      Accounts.create_user(%{"username" => "taken@example.com", "password" => "secret123"})

    conn = conn |> authed_conn(token) |> patch(~p"/api/user", %{username: "taken@example.com"})

    assert %{"errors" => %{"username" => [_ | _]}} = json_response(conn, 422)
  end

  test "PATCH /api/user requires auth", %{conn: conn} do
    conn = patch(conn, ~p"/api/user", %{username: "new@example.com"})
    assert %{"error" => "unauthorized"} = json_response(conn, 401)
  end
end
