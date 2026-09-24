defmodule BonusCalculatorBackendWeb.SuggestionControllerTest do
  use BonusCalculatorBackendWeb.ConnCase, async: true

  alias BonusCalculatorBackend.{Accounts, Distributions}

  setup do
    {:ok, owner} = Accounts.create_user(%{"username" => "owner", "password" => "secret123"})
    {:ok, other} = Accounts.create_user(%{"username" => "other", "password" => "secret123"})
    {:ok, owner_token} = Accounts.create_api_token(owner)
    {:ok, other_token} = Accounts.create_api_token(other)

    {:ok, distribution} =
      Distributions.create_distribution(%{"name" => "Draft", "bonus_budget" => "10000"}, owner)

    %{
      owner: owner,
      other: other,
      owner_token: owner_token.token,
      other_token: other_token.token,
      distribution: distribution
    }
  end

  defp authed_conn(conn, token) do
    conn
    |> put_req_header("authorization", "Bearer #{token}")
    |> put_req_header("accept", "application/json")
  end

  describe "POST /api/distributions/:id/suggestion" do
    test "creates then replaces the caller's suggestion set", %{
      conn: conn,
      other_token: token,
      other: other,
      distribution: distribution
    } do
      conn =
        conn
        |> authed_conn(token)
        |> post(~p"/api/distributions/#{distribution.id}/suggestion", %{
          explanation: "bigger budget",
          changes: %{"distribution" => %{"bonus_budget" => "20000"}}
        })

      assert %{
               "data" => %{
                 "id" => id,
                 "distribution_id" => distribution_id,
                 "user" => %{"id" => user_id, "username" => "other"},
                 "explanation" => "bigger budget",
                 "changes" => %{"distribution" => %{"bonus_budget" => "20000"}}
               }
             } = json_response(conn, 200)

      assert distribution_id == distribution.id
      assert user_id == other.id

      conn =
        build_conn()
        |> authed_conn(token)
        |> post(~p"/api/distributions/#{distribution.id}/suggestion", %{
          explanation: "actually, smaller",
          changes: %{"distribution" => %{"bonus_budget" => "5000"}}
        })

      assert %{"data" => %{"id" => ^id, "explanation" => "actually, smaller"}} =
               json_response(conn, 200)

      assert [suggestion] = Distributions.list_suggestions(distribution)
      assert suggestion.id == id
    end

    test "requires an explanation", %{conn: conn, other_token: token, distribution: distribution} do
      conn =
        conn
        |> authed_conn(token)
        |> post(~p"/api/distributions/#{distribution.id}/suggestion", %{changes: %{}})

      assert %{"errors" => %{"explanation" => [_ | _]}} = json_response(conn, 422)
    end

    test "the owner cannot suggest on their own distribution", %{
      conn: conn,
      owner_token: token,
      distribution: distribution
    } do
      conn =
        conn
        |> authed_conn(token)
        |> post(~p"/api/distributions/#{distribution.id}/suggestion", %{
          explanation: "self",
          changes: %{}
        })

      assert %{"error" => "the distribution owner cannot submit a suggestion"} =
               json_response(conn, 422)
    end

    test "rejected once the distribution is finalized", %{
      conn: conn,
      owner: owner,
      other_token: token,
      distribution: distribution
    } do
      {:ok, _} = Distributions.finalize_distribution(distribution, owner)

      conn =
        conn
        |> authed_conn(token)
        |> post(~p"/api/distributions/#{distribution.id}/suggestion", %{
          explanation: "too late",
          changes: %{}
        })

      assert %{"error" => "distribution is not drafted"} = json_response(conn, 422)
    end

    test "requires auth", %{conn: conn, distribution: distribution} do
      conn =
        post(conn, ~p"/api/distributions/#{distribution.id}/suggestion", %{
          explanation: "anon",
          changes: %{}
        })

      assert %{"error" => "unauthorized"} = json_response(conn, 401)
    end
  end

  describe "GET /api/distributions/:id/suggestions" do
    test "lists suggestion sets with their authors", %{
      conn: conn,
      owner_token: owner_token,
      other: other,
      distribution: distribution
    } do
      {:ok, _} =
        Distributions.upsert_suggestion(distribution, other, %{
          "explanation" => "from other",
          "changes" => %{}
        })

      conn =
        conn
        |> authed_conn(owner_token)
        |> get(~p"/api/distributions/#{distribution.id}/suggestions")

      assert %{"data" => [%{"user" => %{"username" => "other"}, "explanation" => "from other"}]} =
               json_response(conn, 200)
    end
  end

  describe "GET /api/suggestions/:id" do
    test "returns the suggestion plus its simulated computation", %{
      conn: conn,
      owner_token: owner_token,
      other: other,
      distribution: distribution
    } do
      {:ok, suggestion} =
        Distributions.upsert_suggestion(distribution, other, %{
          "explanation" => "double it",
          "changes" => %{"distribution" => %{"bonus_budget" => "20000"}}
        })

      conn = conn |> authed_conn(owner_token) |> get(~p"/api/suggestions/#{suggestion.id}")

      assert %{
               "data" => %{
                 "suggestion" => %{"id" => id, "explanation" => "double it"},
                 "computation" => %{
                   "distribution" => %{"bonus_budget" => "20000"},
                   "totals" => %{"bonus_budget" => "20000"}
                 }
               }
             } = json_response(conn, 200)

      assert id == suggestion.id
    end
  end

  describe "DELETE /api/suggestions/:id" do
    test "only the author can delete", %{
      conn: conn,
      owner_token: owner_token,
      other_token: other_token,
      other: other,
      distribution: distribution
    } do
      {:ok, suggestion} =
        Distributions.upsert_suggestion(distribution, other, %{
          "explanation" => "mine",
          "changes" => %{}
        })

      conn =
        conn |> authed_conn(owner_token) |> delete(~p"/api/suggestions/#{suggestion.id}")

      assert %{"error" => "only the distribution owner can do this"} = json_response(conn, 403)

      conn =
        build_conn()
        |> authed_conn(other_token)
        |> delete(~p"/api/suggestions/#{suggestion.id}")

      assert %{"data" => %{"id" => id}} = json_response(conn, 200)
      assert id == suggestion.id
      assert Distributions.list_suggestions(distribution) == []
    end
  end

  describe "POST /api/distributions/:id/simulate" do
    test "returns the computation with the changes overlaid", %{
      conn: conn,
      other_token: token,
      distribution: distribution
    } do
      conn =
        conn
        |> authed_conn(token)
        |> post(~p"/api/distributions/#{distribution.id}/simulate", %{
          changes: %{"distribution" => %{"bonus_budget" => "20000"}}
        })

      assert %{
               "data" => %{
                 "distribution" => %{"bonus_budget" => "20000"},
                 "totals" => %{"bonus_budget" => "20000"}
               }
             } = json_response(conn, 200)
    end

    test "rejected once the distribution is finalized", %{
      conn: conn,
      owner: owner,
      other_token: token,
      distribution: distribution
    } do
      {:ok, _} = Distributions.finalize_distribution(distribution, owner)

      conn =
        conn
        |> authed_conn(token)
        |> post(~p"/api/distributions/#{distribution.id}/simulate", %{changes: %{}})

      assert %{"error" => "distribution is not drafted"} = json_response(conn, 422)
    end
  end

  describe "ownership on existing mutation endpoints" do
    test "non-owner gets 403 on update, delete, and finalize", %{
      conn: conn,
      other_token: token,
      distribution: distribution
    } do
      conn =
        conn
        |> authed_conn(token)
        |> patch(~p"/api/distributions/#{distribution.id}", %{name: "Nope"})

      assert %{"error" => "only the distribution owner can do this"} = json_response(conn, 403)

      conn =
        build_conn()
        |> authed_conn(token)
        |> post(~p"/api/distributions/#{distribution.id}/finalize")

      assert %{"error" => "only the distribution owner can do this"} = json_response(conn, 403)

      conn =
        build_conn()
        |> authed_conn(token)
        |> delete(~p"/api/distributions/#{distribution.id}")

      assert %{"error" => "only the distribution owner can do this"} = json_response(conn, 403)
    end
  end
end
