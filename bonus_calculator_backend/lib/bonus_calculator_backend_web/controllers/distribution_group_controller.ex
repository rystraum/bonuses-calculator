defmodule BonusCalculatorBackendWeb.DistributionGroupController do
  use BonusCalculatorBackendWeb, :controller

  alias BonusCalculatorBackend.Distributions
  alias BonusCalculatorBackend.Distributions.DistributionGroup

  action_fallback BonusCalculatorBackendWeb.FallbackController

  def create(conn, %{"id" => id} = params) do
    distribution = Distributions.get_distribution!(id)

    with {:ok, %DistributionGroup{} = group} <- Distributions.add_group(distribution, params) do
      conn
      |> put_status(:created)
      |> json(%{data: group_json(group)})
    end
  end

  def update(conn, %{"id" => id} = params) do
    group = Distributions.get_distribution_group!(id)

    with {:ok, %DistributionGroup{} = group} <-
           Distributions.update_distribution_group(group, params) do
      json(conn, %{data: group_json(group)})
    end
  end

  def delete(conn, %{"id" => id}) do
    group = Distributions.get_distribution_group!(id)

    with {:ok, %DistributionGroup{}} <- Distributions.delete_distribution_group(group) do
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
      members:
        Enum.map(group.members, fn member ->
          %{
            id: member.id,
            employee_id: member.employee_id,
            employee_name: member.employee_name,
            hours: Decimal.to_string(member.hours, :normal),
            performance_multiplier: Decimal.to_string(member.performance_multiplier, :normal)
          }
        end)
    }
  end
end
