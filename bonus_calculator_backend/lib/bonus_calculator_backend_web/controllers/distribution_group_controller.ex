defmodule BonusCalculatorBackendWeb.DistributionGroupController do
  use BonusCalculatorBackendWeb, :controller

  alias BonusCalculatorBackend.Distributions
  alias BonusCalculatorBackend.Distributions.DistributionGroup

  action_fallback BonusCalculatorBackendWeb.FallbackController

  def create(conn, %{"id" => id} = params) do
    distribution = Distributions.get_distribution!(id)

    with {:ok, %DistributionGroup{} = group} <-
           Distributions.add_group(distribution, params, conn.assigns.current_user) do
      conn
      |> put_status(:created)
      |> json(%{data: group_json(group)})
    end
  end

  def update(conn, %{"id" => id} = params) do
    group = Distributions.get_distribution_group!(id)

    with {:ok, %DistributionGroup{} = group} <-
           Distributions.update_distribution_group(group, params, conn.assigns.current_user) do
      json(conn, %{data: group_json(group)})
    end
  end

  def delete(conn, %{"id" => id}) do
    group = Distributions.get_distribution_group!(id)

    with {:ok, %DistributionGroup{}} <-
           Distributions.delete_distribution_group(group, conn.assigns.current_user) do
      json(conn, %{data: %{id: id}})
    end
  end

  defp group_json(group) do
    %{
      id: group.id,
      distribution_id: group.distribution_id,
      employee_group_id: group.employee_group_id,
      name: group.name,
      allocation_pct: Decimal.to_string(group.allocation_pct, :normal),
      impact_weight: group.impact_weight,
      effort_weight: group.effort_weight,
      members:
        Enum.map(group.members, fn member ->
          %{
            id: member.id,
            employee_id: member.employee_id,
            employee_name: member.employee_name,
            hours: Decimal.to_string(member.hours, :normal),
            performance_multiplier: Decimal.to_string(member.performance_multiplier, :normal),
            note: member.note
          }
        end)
    }
  end
end
