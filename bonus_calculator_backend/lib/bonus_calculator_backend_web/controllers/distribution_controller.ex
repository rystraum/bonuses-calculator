defmodule BonusCalculatorBackendWeb.DistributionController do
  use BonusCalculatorBackendWeb, :controller

  alias BonusCalculatorBackend.{Calculator, Distributions, People}
  alias BonusCalculatorBackend.Distributions.Distribution

  action_fallback BonusCalculatorBackendWeb.FallbackController

  def index(conn, _params) do
    json(conn, %{data: Enum.map(Distributions.list_distributions(), &summary_json/1)})
  end

  def show(conn, %{"id" => id}) do
    json(conn, %{data: full_json(Distributions.get_distribution_full!(id))})
  end

  def create(conn, params) do
    with {:ok, %Distribution{} = distribution} <-
           Distributions.create_distribution(params, conn.assigns.current_user) do
      conn
      |> put_status(:created)
      |> json(%{data: full_json(Distributions.get_distribution_full!(distribution.id))})
    end
  end

  def update(conn, %{"id" => id} = params) do
    distribution = Distributions.get_distribution!(id)

    with {:ok, %Distribution{} = distribution} <-
           Distributions.update_distribution(distribution, params) do
      json(conn, %{data: full_json(Distributions.get_distribution_full!(distribution.id))})
    end
  end

  def delete(conn, %{"id" => id}) do
    distribution = Distributions.get_distribution!(id)

    with {:ok, %Distribution{}} <- Distributions.delete_distribution(distribution) do
      json(conn, %{data: %{id: id}})
    end
  end

  def finalize(conn, %{"id" => id}) do
    distribution = Distributions.get_distribution!(id)

    with {:ok, %Distribution{} = distribution} <-
           Distributions.finalize_distribution(distribution, conn.assigns.current_user) do
      json(conn, %{data: summary_json(distribution)})
    end
  end

  def mark_paid(conn, %{"id" => id}) do
    distribution = Distributions.get_distribution!(id)

    with {:ok, %Distribution{} = distribution} <-
           Distributions.mark_paid_distribution(distribution, conn.assigns.current_user) do
      json(conn, %{data: summary_json(distribution)})
    end
  end

  def computation(conn, %{"id" => id}) do
    distribution = Distributions.get_distribution_full!(id)
    shareholders = People.list_shareholders()

    json(conn, %{data: Calculator.compute(distribution, shareholders)})
  end

  defp summary_json(distribution) do
    %{
      id: distribution.id,
      name: distribution.name,
      description: distribution.description,
      status: distribution.status,
      include_shareholders: distribution.include_shareholders,
      bonus_budget: dec(distribution.bonus_budget),
      dividends_budget: dec(distribution.dividends_budget),
      effort_weight: distribution.effort_weight,
      impact_weight: distribution.impact_weight,
      rounding_step: distribution.rounding_step,
      created_by: user_json(distribution.created_by),
      finalized_by: user_json(distribution.finalized_by),
      paid_out_by: user_json(distribution.paid_out_by),
      finalized_at: distribution.finalized_at,
      paid_out_at: distribution.paid_out_at,
      inserted_at: distribution.inserted_at,
      updated_at: distribution.updated_at
    }
  end

  defp user_json(nil), do: nil
  defp user_json(user), do: %{id: user.id, username: user.username}

  defp full_json(distribution) do
    distribution
    |> summary_json()
    |> Map.merge(%{
      distribution_groups:
        Enum.map(distribution.distribution_groups, fn group ->
          %{
            id: group.id,
            employee_group_id: group.employee_group_id,
            name: group.name,
            allocation_pct: dec(group.allocation_pct),
            impact_weight: group.impact_weight,
            effort_weight: group.effort_weight,
            members:
              Enum.map(group.members, fn member ->
                %{
                  id: member.id,
                  employee_id: member.employee_id,
                  employee_name: member.employee_name,
                  hours: dec(member.hours),
                  performance_multiplier: dec(member.performance_multiplier),
                  note: member.note
                }
              end)
          }
        end),
      special_bonuses:
        Enum.map(distribution.special_bonuses, fn bonus ->
          %{
            id: bonus.id,
            employee_id: bonus.employee_id,
            employee_name: bonus.employee && bonus.employee.name,
            name: bonus.name,
            amount: dec(bonus.amount),
            note: bonus.note
          }
        end)
    })
  end

  defp dec(%Decimal{} = value), do: Decimal.to_string(value, :normal)
end
