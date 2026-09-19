defmodule BonusCalculatorBackendWeb.EmployeeControllerTest do
  use BonusCalculatorBackendWeb.ConnCase, async: true

  alias BonusCalculatorBackend.{Accounts, People}

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

  test "POST /api/employees with a classification returns the new fields", %{
    conn: conn,
    token: token
  } do
    conn =
      conn
      |> authed_conn(token)
      |> post(~p"/api/employees", %{name: "Alice", classification: "professional"})

    assert %{
             "data" => %{
               "name" => "Alice",
               "classification" => "professional",
               "archived" => false,
               "archived_at" => nil
             }
           } = json_response(conn, 201)
  end

  test "POST /api/employees rejects an invalid classification", %{conn: conn, token: token} do
    conn =
      conn
      |> authed_conn(token)
      |> post(~p"/api/employees", %{name: "Alice", classification: "intern"})

    assert %{"errors" => %{"classification" => ["is invalid"]}} = json_response(conn, 422)
  end

  test "PATCH /api/employees/:id archives and unarchives", %{
    conn: conn,
    token: token,
    user: user
  } do
    {:ok, employee} = People.create_employee(%{"name" => "Alice"})

    conn =
      conn
      |> authed_conn(token)
      |> patch(~p"/api/employees/#{employee.id}", %{archived: true})

    assert %{
             "data" => %{
               "archived" => true,
               "archived_at" => archived_at,
               "archived_by" => %{"id" => archived_by_id, "username" => "admin"}
             }
           } = json_response(conn, 200)

    assert is_binary(archived_at)
    assert archived_by_id == user.id

    conn =
      build_conn()
      |> authed_conn(token)
      |> patch(~p"/api/employees/#{employee.id}", %{archived: false})

    assert %{"data" => %{"archived" => false, "archived_at" => nil, "archived_by" => nil}} =
             json_response(conn, 200)
  end

  test "GET /api/employees includes classification and archived flags", %{
    conn: conn,
    token: token
  } do
    {:ok, active} = People.create_employee(%{"name" => "Active", "classification" => "full_time"})
    {:ok, archived} = People.create_employee(%{"name" => "Gone"})
    {:ok, _} = People.update_employee(archived, %{"archived" => true})

    conn = conn |> authed_conn(token) |> get(~p"/api/employees")

    assert %{"data" => employees} = json_response(conn, 200)
    by_name = Map.new(employees, &{&1["name"], &1})

    assert by_name["Active"]["classification"] == "full_time"
    assert by_name["Active"]["archived"] == false
    assert by_name["Active"]["archived_at"] == nil
    assert by_name["Gone"]["classification"] == nil
    assert by_name["Gone"]["archived"] == true
    assert is_binary(by_name["Gone"]["archived_at"])
    # Archived via a code path without a user — archived_by stays null.
    assert by_name["Gone"]["archived_by"] == nil

    assert active.id == by_name["Active"]["id"]
  end
end
