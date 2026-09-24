defmodule BonusCalculatorBackendWeb.ApprovalControllerTest do
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

  describe "POST /api/distributions/:id/approval" do
    test "creates then replaces the caller's approval", %{
      conn: conn,
      other_token: token,
      other: other,
      distribution: distribution
    } do
      conn =
        conn
        |> authed_conn(token)
        |> post(~p"/api/distributions/#{distribution.id}/approval", %{
          selfie: "data:image/jpeg;base64,abc"
        })

      assert %{
               "data" => %{
                 "id" => id,
                 "distribution_id" => distribution_id,
                 "user" => %{"id" => user_id, "username" => "other"},
                 "selfie" => "data:image/jpeg;base64,abc",
                 "approved_at" => approved_at
               }
             } = json_response(conn, 200)

      assert distribution_id == distribution.id
      assert user_id == other.id
      assert is_binary(approved_at)

      conn =
        build_conn()
        |> authed_conn(token)
        |> post(~p"/api/distributions/#{distribution.id}/approval", %{
          selfie: "data:image/jpeg;base64,xyz"
        })

      assert %{"data" => %{"id" => ^id, "selfie" => "data:image/jpeg;base64,xyz"}} =
               json_response(conn, 200)

      assert [approval] = Distributions.list_approvals(distribution)
      assert approval.id == id
    end

    test "requires a selfie", %{conn: conn, other_token: token, distribution: distribution} do
      conn =
        conn
        |> authed_conn(token)
        |> post(~p"/api/distributions/#{distribution.id}/approval", %{})

      assert %{"errors" => %{"selfie" => [_ | _]}} = json_response(conn, 422)
    end

    test "the owner cannot approve their own distribution", %{
      conn: conn,
      owner_token: token,
      distribution: distribution
    } do
      conn =
        conn
        |> authed_conn(token)
        |> post(~p"/api/distributions/#{distribution.id}/approval", %{selfie: "self"})

      assert %{"error" => "the distribution owner cannot approve"} = json_response(conn, 422)
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
        |> post(~p"/api/distributions/#{distribution.id}/approval", %{selfie: "too late"})

      assert %{"error" => "distribution is not drafted"} = json_response(conn, 422)
    end

    test "requires auth", %{conn: conn, distribution: distribution} do
      conn =
        post(conn, ~p"/api/distributions/#{distribution.id}/approval", %{selfie: "anon"})

      assert %{"error" => "unauthorized"} = json_response(conn, 401)
    end
  end

  describe "GET /api/distributions/:id/approvals" do
    test "lists approvals with their authors", %{
      conn: conn,
      owner_token: owner_token,
      other: other,
      distribution: distribution
    } do
      {:ok, _} = Distributions.approve_distribution(distribution, other, "selfie")

      conn =
        conn
        |> authed_conn(owner_token)
        |> get(~p"/api/distributions/#{distribution.id}/approvals")

      assert %{"data" => [%{"user" => %{"username" => "other"}, "selfie" => "selfie"}]} =
               json_response(conn, 200)
    end
  end

  describe "GET /api/distributions/:id/participation" do
    test "returns all users with their seen/suggested/approved state", %{
      conn: conn,
      owner_token: owner_token,
      other_token: other_token,
      owner: owner,
      other: other,
      distribution: distribution
    } do
      {:ok, _} =
        Distributions.upsert_suggestion(distribution, other, %{
          "explanation" => "more",
          "changes" => %{}
        })

      {:ok, approval} = Distributions.approve_distribution(distribution, other, "selfie")

      # The owner opening the distribution records their view.
      conn =
        conn
        |> authed_conn(owner_token)
        |> get(~p"/api/distributions/#{distribution.id}")

      assert %{"data" => %{"id" => _}} = json_response(conn, 200)

      conn =
        build_conn()
        |> authed_conn(other_token)
        |> get(~p"/api/distributions/#{distribution.id}/participation")

      assert %{"data" => [other_entry, owner_entry]} = json_response(conn, 200)

      assert %{
               "user" => %{"id" => other_id, "username" => "other"},
               "seen_at" => nil,
               "suggested_at" => suggested_at,
               "approval" => %{
                 "id" => approval_id,
                 "selfie" => "selfie",
                 "approved_at" => approved_at
               }
             } = other_entry

      assert other_id == other.id
      assert is_binary(suggested_at)
      assert approval_id == approval.id
      assert is_binary(approved_at)

      assert %{
               "user" => %{"id" => owner_id, "username" => "owner"},
               "suggested_at" => nil,
               "approval" => nil
             } = owner_entry

      assert owner_id == owner.id
      assert is_binary(owner_entry["seen_at"])
    end

    test "requires auth", %{conn: conn, distribution: distribution} do
      conn = get(conn, ~p"/api/distributions/#{distribution.id}/participation")

      assert %{"error" => "unauthorized"} = json_response(conn, 401)
    end
  end

  describe "DELETE /api/distributions/:id/approval" do
    test "the author can rescind; without an approval it 404s", %{
      conn: conn,
      owner_token: owner_token,
      other_token: other_token,
      other: other,
      distribution: distribution
    } do
      {:ok, approval} = Distributions.approve_distribution(distribution, other, "selfie")

      conn =
        conn
        |> authed_conn(owner_token)
        |> delete(~p"/api/distributions/#{distribution.id}/approval")

      assert %{"error" => "no approval to rescind"} = json_response(conn, 404)

      conn =
        build_conn()
        |> authed_conn(other_token)
        |> delete(~p"/api/distributions/#{distribution.id}/approval")

      assert %{"data" => %{"id" => id}} = json_response(conn, 200)
      assert id == approval.id
      assert Distributions.list_approvals(distribution) == []
    end

    test "requires auth", %{conn: conn, distribution: distribution} do
      conn = delete(conn, ~p"/api/distributions/#{distribution.id}/approval")

      assert %{"error" => "unauthorized"} = json_response(conn, 401)
    end
  end
end
