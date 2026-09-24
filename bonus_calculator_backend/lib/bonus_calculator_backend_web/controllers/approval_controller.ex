defmodule BonusCalculatorBackendWeb.ApprovalController do
  use BonusCalculatorBackendWeb, :controller

  alias BonusCalculatorBackend.Distributions
  alias BonusCalculatorBackend.Distributions.DistributionApproval

  action_fallback BonusCalculatorBackendWeb.FallbackController

  def index(conn, %{"id" => id}) do
    distribution = Distributions.get_distribution!(id)
    approvals = Distributions.list_approvals(distribution)

    json(conn, %{data: Enum.map(approvals, &approval_json/1)})
  end

  def participation(conn, %{"id" => id}) do
    distribution = Distributions.get_distribution!(id)
    participation = Distributions.participation(distribution)

    json(conn, %{data: Enum.map(participation, &participation_json/1)})
  end

  def approve(conn, %{"id" => id} = params) do
    distribution = Distributions.get_distribution!(id)

    with {:ok, %DistributionApproval{} = approval} <-
           Distributions.approve_distribution(
             distribution,
             conn.assigns.current_user,
             params["selfie"]
           ) do
      json(conn, %{data: approval_json(approval)})
    end
  end

  def rescind(conn, %{"id" => id}) do
    distribution = Distributions.get_distribution!(id)

    with {:ok, %DistributionApproval{} = approval} <-
           Distributions.rescind_approval(distribution, conn.assigns.current_user) do
      json(conn, %{data: %{id: approval.id}})
    end
  end

  defp approval_json(approval) do
    %{
      id: approval.id,
      distribution_id: approval.distribution_id,
      user: %{id: approval.user.id, username: approval.user.username},
      selfie: approval.selfie,
      approved_at: approval.approved_at
    }
  end

  defp participation_json(entry) do
    %{
      user: %{id: entry.user.id, username: entry.user.username},
      seen_at: entry.seen_at,
      suggested_at: entry.suggested_at,
      approval: entry.approval && approval_brief_json(entry.approval)
    }
  end

  defp approval_brief_json(approval) do
    %{id: approval.id, selfie: approval.selfie, approved_at: approval.approved_at}
  end
end
