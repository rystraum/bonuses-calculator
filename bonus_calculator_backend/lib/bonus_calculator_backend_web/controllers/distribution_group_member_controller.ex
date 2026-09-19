defmodule BonusCalculatorBackendWeb.DistributionGroupMemberController do
  use BonusCalculatorBackendWeb, :controller

  alias BonusCalculatorBackend.Distributions
  alias BonusCalculatorBackend.Distributions.DistributionGroupMember

  action_fallback BonusCalculatorBackendWeb.FallbackController

  def update(conn, %{"id" => id} = params) do
    member = Distributions.get_member!(id)

    with {:ok, %DistributionGroupMember{} = member} <- Distributions.update_member(member, params) do
      json(conn, %{
        data: %{
          id: member.id,
          distribution_group_id: member.distribution_group_id,
          employee_id: member.employee_id,
          employee_name: member.employee_name,
          hours: Decimal.to_string(member.hours, :normal),
          performance_multiplier: Decimal.to_string(member.performance_multiplier, :normal),
          note: member.note
        }
      })
    end
  end
end
