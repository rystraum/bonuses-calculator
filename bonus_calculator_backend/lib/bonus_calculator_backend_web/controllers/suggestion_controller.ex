defmodule BonusCalculatorBackendWeb.SuggestionController do
  use BonusCalculatorBackendWeb, :controller

  alias BonusCalculatorBackend.Distributions
  alias BonusCalculatorBackend.Distributions.DistributionSuggestion

  action_fallback BonusCalculatorBackendWeb.FallbackController

  def index(conn, %{"id" => id}) do
    distribution = Distributions.get_distribution!(id)
    suggestions = Distributions.list_suggestions(distribution)

    json(conn, %{data: Enum.map(suggestions, &suggestion_json/1)})
  end

  def upsert(conn, %{"id" => id} = params) do
    distribution = Distributions.get_distribution!(id)

    with {:ok, %DistributionSuggestion{} = suggestion} <-
           Distributions.upsert_suggestion(distribution, conn.assigns.current_user, params) do
      json(conn, %{data: suggestion_json(suggestion)})
    end
  end

  def show(conn, %{"id" => id}) do
    suggestion = Distributions.get_suggestion!(id)
    computation = Distributions.simulate(suggestion.distribution, suggestion.changes)

    json(conn, %{data: %{suggestion: suggestion_json(suggestion), computation: computation}})
  end

  def delete(conn, %{"id" => id}) do
    suggestion = Distributions.get_suggestion!(id)

    with {:ok, %DistributionSuggestion{}} <-
           Distributions.delete_suggestion(suggestion, conn.assigns.current_user) do
      json(conn, %{data: %{id: id}})
    end
  end

  def simulate(conn, %{"id" => id} = params) do
    distribution = Distributions.get_distribution_full!(id)

    if distribution.status == "drafted" do
      json(conn, %{data: Distributions.simulate(distribution, params["changes"] || %{})})
    else
      {:error, :not_drafted}
    end
  end

  defp suggestion_json(suggestion) do
    %{
      id: suggestion.id,
      distribution_id: suggestion.distribution_id,
      user: %{id: suggestion.user.id, username: suggestion.user.username},
      explanation: suggestion.explanation,
      changes: suggestion.changes,
      inserted_at: suggestion.inserted_at,
      updated_at: suggestion.updated_at
    }
  end
end
