defmodule BonusCalculatorBackendWeb.SpecialBonusController do
  use BonusCalculatorBackendWeb, :controller

  alias BonusCalculatorBackend.Distributions
  alias BonusCalculatorBackend.Distributions.DistributionSpecialBonus

  action_fallback BonusCalculatorBackendWeb.FallbackController

  def create(conn, %{"id" => id} = params) do
    distribution = Distributions.get_distribution!(id)

    with {:ok, %DistributionSpecialBonus{} = bonus} <-
           Distributions.add_special_bonus(distribution, params) do
      bonus = BonusCalculatorBackend.Repo.preload(bonus, :employee)

      conn
      |> put_status(:created)
      |> json(%{data: bonus_json(bonus)})
    end
  end

  def delete(conn, %{"id" => id}) do
    bonus = Distributions.get_special_bonus!(id)

    with {:ok, %DistributionSpecialBonus{}} <- Distributions.delete_special_bonus(bonus) do
      json(conn, %{data: %{id: id}})
    end
  end

  defp bonus_json(bonus) do
    %{
      id: bonus.id,
      distribution_id: bonus.distribution_id,
      employee_id: bonus.employee_id,
      employee_name: bonus.employee && bonus.employee.name,
      name: bonus.name,
      amount: Decimal.to_string(bonus.amount, :normal),
      note: bonus.note
    }
  end
end
